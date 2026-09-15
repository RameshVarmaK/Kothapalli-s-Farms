/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  StockItem,
  StockPurchase,
  StockUsage,
  Field,
  Season,
  Member,
  Activity,
  CommonAllocationType
} from '../types';
import { Plus, Archive } from 'lucide-react';
import { computeStockLevels, calculateAllocations, allocationDiscrepancy } from '../utils/calculations';
import { validatePurchase, validateUsage } from '../utils/validation';
import { StockLevelsSegment } from './stock/StockLevelsSegment';
import { PurchasesSegment } from './stock/PurchasesSegment';
import { UsagesSegment } from './stock/UsagesSegment';
import { StockEntryModal } from './stock/StockEntryModal';

interface StockTabProps {
  stockItems: StockItem[];
  purchases: StockPurchase[];
  usages: StockUsage[];
  fields: Field[];
  seasons: Season[];
  members: Member[];
  activities: Activity[];
  currency: string;
  onAddStockItem: (item: StockItem) => void;
  onUpdateStockItem: (item: StockItem) => void;
  onAddPurchase: (purchase: StockPurchase) => void;
  onUpdatePurchase: (purchase: StockPurchase) => void;
  onAddUsage: (usage: StockUsage) => void;
  onUpdateUsage: (usage: StockUsage) => void;
}

export const StockTab: React.FC<StockTabProps> = ({
  stockItems = [],
  purchases = [],
  usages = [],
  fields = [],
  seasons = [],
  members = [],
  activities = [],
  currency,
  onAddStockItem,
  onUpdateStockItem,
  onAddPurchase,
  onUpdatePurchase,
  onAddUsage,
  onUpdateUsage
}) => {
  const [activeSegment, setActiveSegment] = useState<'levels' | 'purchases' | 'usages'>('levels');
  const [isOpenAddModal, setIsOpenAddModal] = useState(false);
  const [modalType, setModalType] = useState<'item' | 'purchase' | 'usage'>('purchase');
  const [editingItem, setEditingItem] = useState<StockItem | null>(null);
  const [editingPurchase, setEditingPurchase] = useState<StockPurchase | null>(null);
  const [editingUsage, setEditingUsage] = useState<StockUsage | null>(null);

  // Input Stock Item state
  const [itemName, setItemName] = useState('');
  const [itemType, setItemType] = useState<StockItem['type']>('Fertilizer');
  const [itemUnit, setItemUnit] = useState('');

  // Purchase state
  const [selectedItemId, setSelectedItemId] = useState('');
  const [purchaseQty, setPurchaseQty] = useState('');
  const [purchaseCost, setPurchaseCost] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0]);
  const [purchasePayer, setPurchasePayer] = useState(members[0]?.id || '');

  // Usage state
  const [usageQty, setUsageQty] = useState('');
  const [usageDate, setUsageDate] = useState(new Date().toISOString().split('T')[0]);
  const [usageTargetType, setUsageTargetType] = useState<'single' | 'common'>('single');
  const [usageSeasonId, setUsageSeasonId] = useState('');
  const [usageAllocationRule, setUsageAllocationRule] = useState<CommonAllocationType>('equal');
  const [usageParticipatingSeasons, setUsageParticipatingSeasons] = useState<string[]>([]);
  const [manualUsageAllocations, setManualUsageAllocations] = useState<{ [key: string]: string }>({});
  const [usageLinkedActivityId, setUsageLinkedActivityId] = useState('');

  const [errorMessage, setErrorMessage] = useState('');

  // Computed live stats
  const computedStockList = computeStockLevels(stockItems, purchases, usages);
  const activeSeasons = seasons.filter(s => !s.isClosed);

  const handleSaveStockItem = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    if (!itemName || !itemUnit) {
      setErrorMessage('Both a name and a unit (e.g. kg, litre, bag) are required.');
      return;
    }

    if (editingItem) {
      const updatedItem: StockItem = {
        ...editingItem,
        name: itemName,
        type: itemType,
        unit: itemUnit
      };
      onUpdateStockItem(updatedItem);
    } else {
      const newItem: StockItem = {
        id: `item_${Date.now()}`,
        name: itemName,
        type: itemType,
        unit: itemUnit,
        quantityOnHand: 0,
        weightedAverageCost: 0,
        totalCostSpent: 0,
        fundingByMember: {}
      };
      onAddStockItem(newItem);
    }
    closeAndReset();
  };

  const handleOpenEditItem = (item: StockItem) => {
    const pristine = stockItems.find(i => i.id === item.id) || item;
    setEditingItem(pristine);
    setItemName(pristine.name);
    setItemType(pristine.type);
    setItemUnit(pristine.unit);
    setModalType('item');
    setIsOpenAddModal(true);
  };

  const handleSavePurchase = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    if (!selectedItemId) {
      setErrorMessage('Select which material this purchase is for.');
      return;
    }
    const qty = parseFloat(purchaseQty);
    const cost = parseFloat(purchaseCost);

    const purchasePost: StockPurchase = {
      ...(editingPurchase || {}),
      id: editingPurchase ? editingPurchase.id : `purc_${Date.now()}`,
      stockItemId: selectedItemId,
      quantity: qty,
      totalCost: cost,
      date: purchaseDate,
      paidByMemberId: purchasePayer
    } as StockPurchase;

    const validation = validatePurchase(purchasePost);
    if (!validation.valid) {
      setErrorMessage(validation.errors.join('; '));
      return;
    }

    if (editingPurchase) {
      onUpdatePurchase(purchasePost);
    } else {
      onAddPurchase(purchasePost);
    }
    closeAndReset();
  };

  const handleOpenEditPurchase = (purchase: StockPurchase) => {
    setEditingPurchase(purchase);
    setSelectedItemId(purchase.stockItemId);
    setPurchaseQty(String(purchase.quantity));
    setPurchaseCost(String(purchase.totalCost));
    setPurchaseDate(purchase.date);
    setPurchasePayer(purchase.paidByMemberId);
    setModalType('purchase');
    setIsOpenAddModal(true);
  };

  const handleSaveUsage = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    if (!selectedItemId) {
      setErrorMessage('Select which material this usage is for.');
      return;
    }
    const qty = parseFloat(usageQty);
    const usageDateCheck = validateUsage({ id: '', stockItemId: selectedItemId, quantityUsed: qty, date: usageDate, targetType: usageTargetType });
    if (!usageDateCheck.valid) {
      setErrorMessage(usageDateCheck.errors.join('; '));
      return;
    }

    const selectedStock = computedStockList.find(i => i.id === selectedItemId);
    // computedStockList already has this exact usage's old quantity deducted
    // (if we're editing one on the same material) — add it back before
    // checking availability, else a same-or-smaller edit could be wrongly
    // rejected as insufficient stock.
    const reclaimedQty = (editingUsage && editingUsage.stockItemId === selectedItemId) ? editingUsage.quantityUsed : 0;
    const availableForThisSave = (selectedStock?.quantityOnHand || 0) + reclaimedQty;
    if (!selectedStock || availableForThisSave < qty) {
      setErrorMessage(`Insufficient stock level on hand! Remaining stock available for ${selectedStock?.name || 'input'} is: ${availableForThisSave} ${selectedStock?.unit || ''}.`);
      return;
    }

    let newUsage: StockUsage;

    if (usageTargetType === 'single') {
      const s = seasons.find(sea => sea.id === usageSeasonId);
      if (!s) return;
      newUsage = {
        id: editingUsage ? editingUsage.id : `use_${Date.now()}`,
        stockItemId: selectedItemId,
        quantityUsed: qty,
        date: usageDate,
        targetType: 'single',
        targetFieldId: s.fieldId,
        targetSeasonId: s.id,
        linkedActivityId: usageLinkedActivityId || undefined
      };
    } else {
      // Guard rail: when using the 'manual' rule for stock usages we must
      // ensure per-season quantities sum to the headline quantity. Without
      // this, the consumption math becomes inconsistent with the on-hand
      // count and settlement allocation. See MoneyTab for the equivalent
      // expense-side check.
      if (usageAllocationRule === 'manual') {
        const parsedManual: { [key: string]: number } = {};
        Object.keys(manualUsageAllocations).forEach(k => {
          parsedManual[k] = parseFloat(manualUsageAllocations[k]) || 0;
        });
        const diff = allocationDiscrepancy(qty, parsedManual);
        if (Math.abs(diff) > 0.001) {
          setErrorMessage(
            `Manual quantities are off by ${diff > 0 ? '+' : ''}${diff.toFixed(3)}. ` +
            `Per-season quantities must sum to exactly ${qty}. Adjust before saving.`,
          );
          return;
        }
      }

      // Common stock allocation
      const participatingDetailed = usageParticipatingSeasons.map(sid => {
        const s = seasons.find(sea => sea.id === sid);
        if (!s) return null;
        const f = fields.find(field => field.id === s.fieldId);
        return {
          fieldId: s.fieldId,
          seasonId: s.id,
          fieldArea: f?.area || 1
        };
      }).filter((v): v is { fieldId: string; seasonId: string; fieldArea: number } => v !== null);

      const parsedManual: { [key: string]: number } = {};
      Object.keys(manualUsageAllocations).forEach(k => {
        parsedManual[k] = parseFloat(manualUsageAllocations[k]) || 0;
      });

      // Split base quantity
      const calculatedAlloc = calculateAllocations(qty, usageAllocationRule, participatingDetailed, parsedManual);

      const usageAllocWithRates = calculatedAlloc.map(al => ({
        fieldId: al.fieldId,
        seasonId: al.seasonId,
        quantity: al.amount, // Alloc splits quantity in this case
        amount: Number((al.amount * selectedStock.weightedAverageCost).toFixed(2))
      }));

      newUsage = {
        id: editingUsage ? editingUsage.id : `use_${Date.now()}`,
        stockItemId: selectedItemId,
        quantityUsed: qty,
        date: usageDate,
        targetType: 'common',
        commonAllocationRule: usageAllocationRule,
        allocations: usageAllocWithRates,
        linkedActivityId: usageLinkedActivityId || undefined
      };
    }

    if (editingUsage) {
      onUpdateUsage(newUsage);
    } else {
      onAddUsage(newUsage);
    }
    closeAndReset();
  };

  const handleOpenEditUsage = (usage: StockUsage) => {
    setEditingUsage(usage);
    setSelectedItemId(usage.stockItemId);
    setUsageQty(String(usage.quantityUsed));
    setUsageDate(usage.date);
    setUsageTargetType(usage.targetType);
    setUsageLinkedActivityId(usage.linkedActivityId || '');
    if (usage.targetType === 'single') {
      setUsageSeasonId(usage.targetSeasonId || '');
      setUsageParticipatingSeasons([]);
      setManualUsageAllocations({});
    } else {
      setUsageAllocationRule(usage.commonAllocationRule || 'equal');
      setUsageParticipatingSeasons((usage.allocations || []).map(a => a.seasonId));
      const manualMap: { [key: string]: string } = {};
      (usage.allocations || []).forEach(a => {
        manualMap[`${a.fieldId}_${a.seasonId}`] = String(a.quantity);
      });
      setManualUsageAllocations(manualMap);
    }
    setModalType('usage');
    setIsOpenAddModal(true);
  };

  const closeAndReset = () => {
    setIsOpenAddModal(false);
    setEditingItem(null);
    setEditingPurchase(null);
    setEditingUsage(null);
    setItemName('');
    setItemType('Fertilizer');
    setItemUnit('');
    setPurchaseQty('');
    setPurchaseCost('');
    setSelectedItemId('');
    setUsageQty('');
    setUsageTargetType('single');
    setUsageAllocationRule('equal');
    setErrorMessage('');
    setUsageParticipatingSeasons([]);
    setManualUsageAllocations({});
  };

  const totalInventoryValue = computedStockList.reduce((sum, item) => sum + (item.quantityOnHand * item.weightedAverageCost), 0);

  // Live allocation preview for the common-usage split — mirrors MoneyTab's
  // expense allocation preview so the per-season row values and the
  // running-total summary below stay in sync with what handleSaveUsage
  // will actually write.
  const usageParticipatingDetailedPreview = usageParticipatingSeasons.map(sid => {
    const s = seasons.find(sea => sea.id === sid);
    if (!s) return null;
    return {
      fieldId: s.fieldId,
      seasonId: s.id,
      fieldArea: fields.find(fd => fd.id === s.fieldId)?.area || 1
    };
  }).filter((v): v is { fieldId: string; seasonId: string; fieldArea: number } => v !== null);

  const parsedManualUsagePreview: { [key: string]: number } = {};
  Object.keys(manualUsageAllocations).forEach(k => {
    parsedManualUsagePreview[k] = parseFloat(manualUsageAllocations[k]) || 0;
  });

  const previewUsageQty = parseFloat(usageQty) || 0;
  const usageAllocationPreview = usageTargetType === 'common' && usageParticipatingDetailedPreview.length > 0
    ? calculateAllocations(previewUsageQty, usageAllocationRule, usageParticipatingDetailedPreview, parsedManualUsagePreview)
    : [];
  const usageAllocationTotal = usageAllocationPreview.reduce((sum, a) => sum + a.amount, 0);
  const usageAllocationDiff = Number((previewUsageQty - usageAllocationTotal).toFixed(3));

  const usageAllocationRuleHelp: Record<CommonAllocationType, string> = {
    equal: 'Splits the quantity into identical shares across every checked field, regardless of size.',
    area: 'Splits the quantity in proportion to each field’s registered acreage — bigger fields carry a bigger share.',
    manual: 'You set the exact quantity per field yourself. The entries must add up to the total below.'
  };

  return (
    <div className="space-y-6">
      {/* Upper Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <span className="p-3.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-100">
              <Archive size={20} />
            </span>
            <div>
              <span className="text-[10px] uppercase font-bold tracking-widest text-slate-400">Inventory Sown Value</span>
              <p className="text-xl font-bold font-mono text-slate-800 mt-0.5">
                {currency}{totalInventoryValue.toLocaleString('en-IN')}
              </p>
            </div>
          </div>
          <span className="text-[10px] bg-emerald-50 border border-emerald-150 font-bold px-2.5 py-1 rounded-lg text-emerald-800 uppercase tracking-wider">Asset Reserve</span>
        </div>

        <div className="bg-white px-5 py-3 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between gap-4">
          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-250">
            {(['levels', 'purchases', 'usages'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveSegment(tab)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-all cursor-pointer ${
                  activeSegment === tab ? 'bg-white text-emerald-800 shadow-xs' : 'text-slate-400 hover:text-slate-750'
                }`}
              >
                {tab === 'levels' ? 'Reserves' : tab === 'purchases' ? 'Intakes' : 'Usage'}
              </button>
            ))}
          </div>

          <button
            onClick={() => {
              setSelectedItemId(stockItems[0]?.id || '');
              setUsageSeasonId(activeSeasons[0]?.id || '');
              setModalType('purchase');
              setIsOpenAddModal(true);
            }}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs active:scale-95 cursor-pointer shadow-xs transition-all"
          >
            <Plus size={14} />
            <span>Record Ledger</span>
          </button>
        </div>
      </div>

      {/* CORE SEGMENTS */}
      {activeSegment === 'levels' && (
        <StockLevelsSegment
          computedStockList={computedStockList}
          currency={currency}
          onCreateItemType={() => {
            setModalType('item');
            setIsOpenAddModal(true);
          }}
          onEditItem={handleOpenEditItem}
        />
      )}

      {/* SEGMENT PURCHASES */}
      {activeSegment === 'purchases' && (
        <PurchasesSegment
          purchases={purchases}
          stockItems={stockItems}
          members={members}
          currency={currency}
          onLogPurchase={() => {
            if (stockItems.length === 0) { setModalType('item'); } else { setModalType('purchase'); }
            setIsOpenAddModal(true);
          }}
          onEditPurchase={handleOpenEditPurchase}
        />
      )}

      {/* SEGMENT USAGES */}
      {activeSegment === 'usages' && (
        <UsagesSegment
          usages={usages}
          purchases={purchases}
          stockItems={stockItems}
          computedStockList={computedStockList}
          seasons={seasons}
          fields={fields}
          currency={currency}
          onLogUsage={() => {
            if (stockItems.length === 0) { setModalType('item'); } else if (purchases.length === 0) { setModalType('purchase'); } else { setModalType('usage'); }
            setIsOpenAddModal(true);
          }}
          onEditUsage={handleOpenEditUsage}
        />
      )}

      {/* INTAKE / CONSUMPTION ENTRY MODAL */}
      {isOpenAddModal && (
        <StockEntryModal
          modalType={modalType}
          setModalType={setModalType}
          errorMessage={errorMessage}
          setErrorMessage={setErrorMessage}
          activeSeasons={activeSeasons}
          setUsageSeasonId={setUsageSeasonId}
          onClose={closeAndReset}
          isEditingItem={!!editingItem}
          isEditingPurchase={!!editingPurchase}
          isEditingUsage={!!editingUsage}
          itemName={itemName}
          setItemName={setItemName}
          itemType={itemType}
          setItemType={setItemType}
          itemUnit={itemUnit}
          setItemUnit={setItemUnit}
          onSubmitItem={handleSaveStockItem}
          stockItems={stockItems}
          members={members}
          currency={currency}
          selectedItemId={selectedItemId}
          setSelectedItemId={setSelectedItemId}
          purchaseQty={purchaseQty}
          setPurchaseQty={setPurchaseQty}
          purchaseCost={purchaseCost}
          setPurchaseCost={setPurchaseCost}
          purchaseDate={purchaseDate}
          setPurchaseDate={setPurchaseDate}
          purchasePayer={purchasePayer}
          setPurchasePayer={setPurchasePayer}
          onSubmitPurchase={handleSavePurchase}
          computedStockList={computedStockList}
          seasons={seasons}
          fields={fields}
          activities={activities}
          usageQty={usageQty}
          setUsageQty={setUsageQty}
          usageDate={usageDate}
          setUsageDate={setUsageDate}
          usageTargetType={usageTargetType}
          setUsageTargetType={setUsageTargetType}
          usageSeasonId={usageSeasonId}
          usageAllocationRule={usageAllocationRule}
          setUsageAllocationRule={setUsageAllocationRule}
          usageParticipatingSeasons={usageParticipatingSeasons}
          setUsageParticipatingSeasons={setUsageParticipatingSeasons}
          manualUsageAllocations={manualUsageAllocations}
          setManualUsageAllocations={setManualUsageAllocations}
          usageLinkedActivityId={usageLinkedActivityId}
          setUsageLinkedActivityId={setUsageLinkedActivityId}
          usageAllocationRuleHelp={usageAllocationRuleHelp}
          usageAllocationPreview={usageAllocationPreview}
          usageAllocationTotal={usageAllocationTotal}
          usageAllocationDiff={usageAllocationDiff}
          previewUsageQty={previewUsageQty}
          onSubmitUsage={handleSaveUsage}
        />
      )}
    </div>
  );
};
