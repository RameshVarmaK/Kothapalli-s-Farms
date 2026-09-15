/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  Member,
  Field,
  Season,
  Expense,
  Labour,
  HarvestRevenue,
  StockUsage,
  StockItem,
  StockPurchase,
  Activity,
  CreditAccount,
  CreditRepayment,
  SettlementSummary,
} from '../types';
import { buildSettlementLedger } from '../utils/calculations';
import { safeStorageGet } from '../utils/database';
import { Plus, Users, Grid, Sprout } from 'lucide-react';
import { PartnersDirectory } from './members/PartnersDirectory';
import { FieldsList } from './members/FieldsList';
import { SeasonsList } from './members/SeasonsList';
import { AddRecordModal } from './members/AddRecordModal';
import { SeasonReportModal } from './members/SeasonReportModal';
import { CloseSeasonModal } from './members/CloseSeasonModal';

interface MembersTabProps {
  fields: Field[];
  seasons: Season[];
  members: Member[];
  expenses: Expense[];
  labours: Labour[];
  revenues: HarvestRevenue[];
  usages: StockUsage[];
  stockItems: StockItem[];
  purchases: StockPurchase[];
  activities: Activity[];
  currency: string;
  creditAccounts?: CreditAccount[];
  creditRepayments?: CreditRepayment[];
  onAddMember: (item: Member) => void;
  onUpdateMember: (item: Member) => void;
  onAddField: (item: Field) => void;
  onUpdateField: (item: Field) => void;
  onAddSeason: (item: Season) => void;
  onUpdateSeason: (item: Season) => void;
  onCloseSeason: (id: string, endDate: string) => void;
  onDeleteMember: (id: string) => void;
  onDeleteField: (id: string) => void;
  onDeleteSeason: (id: string) => void;
}

export const MembersTab: React.FC<MembersTabProps> = ({
  fields = [],
  seasons = [],
  members = [],
  expenses = [],
  labours = [],
  revenues = [],
  usages = [],
  stockItems = [],
  purchases = [],
  activities = [],
  currency,
  creditAccounts = [],
  creditRepayments = [],
  onAddMember,
  onUpdateMember,
  onAddField,
  onUpdateField,
  onAddSeason,
  onUpdateSeason,
  onCloseSeason,
  onDeleteMember,
  onDeleteField,
  onDeleteSeason
}) => {
  const [activeTab, setActiveTab] = useState<'directory' | 'fields' | 'seasons'>('seasons');
  const [isOpenAddModal, setIsOpenAddModal] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [editingField, setEditingField] = useState<Field | null>(null);
  const [editingSeason, setEditingSeason] = useState<Season | null>(null);
  const [selectedReportSeasonId, setSelectedReportSeasonId] = useState<string | null>(null);
  const [copiedReportText, setCopiedReportText] = useState(false);

  // Closing season pop-up instead of window.prompt
  const [closingSeasonId, setClosingSeasonId] = useState<string | null>(null);
  const [closingSeasonDate, setClosingSeasonDate] = useState(new Date().toISOString().split('T')[0]);

  // Form states - Member
  const [memberName, setMemberName] = useState('');
  const [memberPhone, setMemberPhone] = useState('');

  // Form states - Field
  const [fieldName, setFieldName] = useState('');
  const [fieldArea, setFieldArea] = useState('');
  const [fieldLocation, setFieldLocation] = useState('');
  const [fieldShares, setFieldShares] = useState<{ [memberId: string]: string }>({});
  const [fieldSharesError, setFieldSharesError] = useState('');

  // Form states - Season
  const [seasonFieldId, setSeasonFieldId] = useState(fields[0]?.id || '');
  const [seasonCrop, setSeasonCrop] = useState('');
  const [seasonStartDate, setSeasonStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [seasonShares, setSeasonShares] = useState<{ [memberId: string]: string }>({});
  const [seasonSharesError, setSeasonSharesError] = useState('');

  // Pre-populate season-level shares default values from the selected field's shares.
  // Skipped while editing an existing season — its own `shares` (set by
  // handleOpenEditSeason below) must win, not the field's current defaults.
  React.useEffect(() => {
    if (editingSeason) return;
    if (!seasonFieldId) {
      setSeasonShares({});
      return;
    }
    const selectedField = fields.find(f => f.id === seasonFieldId);
    if (!selectedField) {
      setSeasonShares({});
      return;
    }
    const initialShares: { [memberId: string]: string } = {};
    members.forEach(m => {
      const mShare = selectedField.shares.find(sh => sh.memberId === m.id);
      initialShares[m.id] = mShare ? String(mShare.percentage) : '0';
    });
    setSeasonShares(initialShares);
    setSeasonSharesError('');
  }, [seasonFieldId, fields, members, editingSeason]);

  // Roll up ledger statements targeting all seasons. Memoised because every
  // open of the partner-detail accordion would otherwise re-evaluate the
  // full settlement engine.
  const summary: SettlementSummary = useMemo(
    (): SettlementSummary => buildSettlementLedger(
      fields,
      seasons,
      members,
      expenses,
      labours,
      revenues,
      usages,
      stockItems,
      purchases,
      seasons.map(s => s.id),
      creditAccounts,
      creditRepayments,
    ),
    [
      fields, seasons, members, expenses, labours, revenues,
      usages, stockItems, purchases, creditAccounts, creditRepayments,
    ],
  );

  const checkSeasonSettled = (seasonId: string) => {
    const ledger = summary.ledgers.find(l => l.seasonId === seasonId);
    if (!ledger) return true;

    const seasonPositions = ledger.statements.map(stmt => ({
      memberId: stmt.memberId,
      name: stmt.memberName,
      balance: stmt.netPosition
    }));

    let sCreditors = seasonPositions.filter(p => p.balance > 0.01).map(p => ({ ...p })).sort((a, b) => b.balance - a.balance);
    let sDebtors = seasonPositions.filter(p => p.balance < -0.01).map(p => ({ ...p })).sort((a, b) => a.balance - b.balance);

    const seasonSimplifiedDebts: { seasonId: string; fromId: string; toId: string; amount: number }[] = [];

    while (sCreditors.length > 0 && sDebtors.length > 0) {
      const debtor = sDebtors[0];
      const creditor = sCreditors[0];

      const oweAmt = Math.abs(debtor.balance);
      const recAmt = creditor.balance;
      const settleAmt = Number(Math.min(oweAmt, recAmt).toFixed(2));

      seasonSimplifiedDebts.push({
        seasonId: ledger.seasonId,
        fromId: debtor.memberId,
        toId: creditor.memberId,
        amount: settleAmt
      });

      debtor.balance = Number((debtor.balance + settleAmt).toFixed(2));
      creditor.balance = Number((creditor.balance - settleAmt).toFixed(2));

      sCreditors = sCreditors.filter(p => p.balance > 0.01).sort((a, b) => b.balance - a.balance);
      sDebtors = sDebtors.filter(p => p.balance < -0.01).sort((a, b) => a.balance - b.balance);
    }

    if (seasonSimplifiedDebts.length === 0) return true;

    const saved = safeStorageGet('farmledger_cleared_sub_entries');
    let clearedKeys: string[] = [];
    try {
      clearedKeys = saved ? JSON.parse(saved) : [];
    } catch {
      clearedKeys = [];
    }

    return seasonSimplifiedDebts.every(sub => {
      const subKey = `${sub.seasonId}:${sub.fromId}:${sub.toId}:${Math.round(sub.amount)}`;
      return clearedKeys.includes(subKey);
    });
  };

  const handleSaveMember = (e: React.FormEvent) => {
    e.preventDefault();
    if (!memberName) return;

    if (editingMember) {
      const updatedMember: Member = {
        ...editingMember,
        name: memberName,
        phone: memberPhone || undefined
      };
      onUpdateMember(updatedMember);
    } else {
      const newMember: Member = {
        id: `m_${Date.now()}`,
        name: memberName,
        phone: memberPhone || undefined
      };
      onAddMember(newMember);
    }
    closeAndReset();
  };

  const handleOpenEditMember = (member: Member) => {
    setEditingMember(member);
    setMemberName(member.name);
    setMemberPhone(member.phone || '');
    setIsOpenAddModal(true);
  };

  const handleSaveField = (e: React.FormEvent) => {
    e.preventDefault();
    const areaVal = parseFloat(fieldArea);
    if (!fieldName || !areaVal || areaVal <= 0) return;

    // Validate shares sum to exactly 100%
    let sumShares = 0;
    const validatedShares = Object.keys(fieldShares).map(memberId => {
      const percentage = parseFloat(fieldShares[memberId]) || 0;
      sumShares += percentage;
      return { memberId, percentage };
    }).filter(s => s.percentage > 0);

    if (Math.abs(sumShares - 100) > 0.01) {
      setFieldSharesError(`Invalid configuration! The share ratios of all partners must sum to exactly 100%. Currently registered ratio sum is: ${sumShares}%.`);
      return;
    }

    if (editingField) {
      const updatedField: Field = {
        ...editingField,
        name: fieldName,
        area: areaVal,
        locationNote: fieldLocation || undefined,
        shares: validatedShares
      };
      onUpdateField(updatedField);
    } else {
      const newField: Field = {
        id: `f_${Date.now()}`,
        name: fieldName,
        area: areaVal,
        locationNote: fieldLocation || undefined,
        shares: validatedShares
      };
      onAddField(newField);
    }
    closeAndReset();
  };

  const handleOpenEditField = (field: Field) => {
    setEditingField(field);
    setFieldName(field.name);
    setFieldArea(String(field.area));
    setFieldLocation(field.locationNote || '');
    const shareMap: { [memberId: string]: string } = {};
    members.forEach(m => {
      const mShare = field.shares.find(sh => sh.memberId === m.id);
      shareMap[m.id] = mShare ? String(mShare.percentage) : '0';
    });
    setFieldShares(shareMap);
    setFieldSharesError('');
    setIsOpenAddModal(true);
  };

  const handleSaveSeason = (e: React.FormEvent) => {
    e.preventDefault();
    if (!seasonCrop || !seasonFieldId) return;

    // Validate shares sum to exactly 100%
    let sumShares = 0;
    const validatedShares = Object.keys(seasonShares).map(memberId => {
      const percentage = parseFloat(seasonShares[memberId]) || 0;
      sumShares += percentage;
      return { memberId, percentage };
    }).filter(s => s.percentage > 0);

    if (Math.abs(sumShares - 100) > 0.01) {
      setSeasonSharesError(`Invalid configuration! Crop owner share ratios must sum to exactly 100%. Currently registered ratio sum is: ${sumShares}%.`);
      return;
    }

    if (editingSeason) {
      const updatedSeason: Season = {
        ...editingSeason,
        cropName: seasonCrop,
        startDate: seasonStartDate,
        shares: validatedShares
      };
      onUpdateSeason(updatedSeason);
    } else {
      const newSeason: Season = {
        id: `s_${Date.now()}`,
        fieldId: seasonFieldId,
        cropName: seasonCrop,
        startDate: seasonStartDate,
        isClosed: false,
        shares: validatedShares
      };
      onAddSeason(newSeason);
    }
    closeAndReset();
  };

  const handleOpenEditSeason = (season: Season) => {
    setEditingSeason(season);
    setSeasonFieldId(season.fieldId);
    setSeasonCrop(season.cropName);
    setSeasonStartDate(season.startDate);
    const sourceShares = (season.shares && season.shares.length > 0)
      ? season.shares
      : (fields.find(f => f.id === season.fieldId)?.shares || []);
    const shareMap: { [memberId: string]: string } = {};
    members.forEach(m => {
      const mShare = sourceShares.find(sh => sh.memberId === m.id);
      shareMap[m.id] = mShare ? String(mShare.percentage) : '0';
    });
    setSeasonShares(shareMap);
    setSeasonSharesError('');
    setIsOpenAddModal(true);
  };

  const closeAndReset = () => {
    setIsOpenAddModal(false);
    setEditingMember(null);
    setEditingField(null);
    setEditingSeason(null);
    setMemberName('');
    setMemberPhone('');
    setFieldName('');
    setFieldArea('');
    setFieldLocation('');
    setFieldShares({});
    setFieldSharesError('');
    setSeasonCrop('');
    setSeasonStartDate(new Date().toISOString().split('T')[0]);
    setSeasonShares({});
    setSeasonSharesError('');
  };

  const handleDeleteMember = (id: string, name: string) => {
    onDeleteMember(id);
  };

  const handleDeleteField = (id: string, name: string) => {
    onDeleteField(id);
  };

  const handleCloseCropSeason = (id: string) => {
    setClosingSeasonId(id);
    setClosingSeasonDate(new Date().toISOString().split('T')[0]);
  };

  return (
    <div className="space-y-6">
      {/* Sub-Tabs selector */}
      <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
        <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-250">
          <button
            onClick={() => setActiveTab('seasons')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'seasons' ? 'bg-white text-emerald-800 shadow-xs font-bold' : 'text-slate-400 hover:text-slate-750'
            }`}
          >
            <span className="flex items-center gap-1.5"><Grid size={12}/> Sown Seasons</span>
          </button>
          <button
            onClick={() => setActiveTab('fields')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'fields' ? 'bg-white text-emerald-800 shadow-xs font-bold' : 'text-slate-400 hover:text-slate-750'
            }`}
          >
            <span className="flex items-center gap-1.5"><Sprout size={12}/> Fields</span>
          </button>
          <button
            onClick={() => setActiveTab('directory')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'directory' ? 'bg-white text-emerald-850 shadow-xs font-bold' : 'text-slate-400 hover:text-slate-750'
            }`}
          >
            <span className="flex items-center gap-1.5"><Users size={12}/> Partners</span>
          </button>
        </div>

        <button
          onClick={() => {
            setSeasonFieldId(fields[0]?.id || '');
            setIsOpenAddModal(true);
          }}
          className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 font-bold text-white px-4 py-2 rounded-xl text-xs active:scale-95 cursor-pointer shadow-xs"
        >
          <Plus size={14} />
          {activeTab === 'directory' ? 'Add Partner' : activeTab === 'fields' ? 'New Field' : 'Sow Crop'}
        </button>
      </div>

      {activeTab === 'directory' && (
        <PartnersDirectory
          members={members}
          summary={summary}
          currency={currency}
          onAddFirst={() => setIsOpenAddModal(true)}
          onEditMember={handleOpenEditMember}
          onDeleteMember={handleDeleteMember}
        />
      )}

      {activeTab === 'fields' && (
        <FieldsList
          fields={fields}
          members={members}
          onGoToPartners={() => setActiveTab('directory')}
          onAddFirst={() => setIsOpenAddModal(true)}
          onEditField={handleOpenEditField}
          onDeleteField={handleDeleteField}
        />
      )}

      {activeTab === 'seasons' && (
        <SeasonsList
          seasons={seasons}
          fields={fields}
          checkSeasonSettled={checkSeasonSettled}
          onGoToFields={() => setActiveTab('fields')}
          onAddFirst={() => {
            setSeasonFieldId(fields[0]?.id || '');
            setIsOpenAddModal(true);
          }}
          onViewReport={(id) => {
            setSelectedReportSeasonId(id);
            setCopiedReportText(false);
          }}
          onEditSeason={handleOpenEditSeason}
          onCloseCropSeason={handleCloseCropSeason}
          onDeleteSeason={onDeleteSeason}
        />
      )}

      <AddRecordModal
        isOpen={isOpenAddModal}
        activeTab={activeTab}
        members={members}
        fields={fields}
        isEditingMember={!!editingMember}
        isEditingField={!!editingField}
        isEditingSeason={!!editingSeason}
        onClose={closeAndReset}
        memberName={memberName}
        setMemberName={setMemberName}
        memberPhone={memberPhone}
        setMemberPhone={setMemberPhone}
        onSubmitMember={handleSaveMember}
        fieldName={fieldName}
        setFieldName={setFieldName}
        fieldArea={fieldArea}
        setFieldArea={setFieldArea}
        fieldLocation={fieldLocation}
        setFieldLocation={setFieldLocation}
        fieldShares={fieldShares}
        setFieldShares={setFieldShares}
        fieldSharesError={fieldSharesError}
        setFieldSharesError={setFieldSharesError}
        onSubmitField={handleSaveField}
        seasonFieldId={seasonFieldId}
        setSeasonFieldId={setSeasonFieldId}
        seasonCrop={seasonCrop}
        setSeasonCrop={setSeasonCrop}
        seasonStartDate={seasonStartDate}
        setSeasonStartDate={setSeasonStartDate}
        seasonShares={seasonShares}
        setSeasonShares={setSeasonShares}
        seasonSharesError={seasonSharesError}
        setSeasonSharesError={setSeasonSharesError}
        onSubmitSeason={handleSaveSeason}
      />

      <SeasonReportModal
        seasonId={selectedReportSeasonId}
        onClose={() => setSelectedReportSeasonId(null)}
        seasons={seasons}
        fields={fields}
        expenses={expenses}
        labours={labours}
        revenues={revenues}
        usages={usages}
        stockItems={stockItems}
        purchases={purchases}
        activities={activities}
        members={members}
        currency={currency}
        copiedReportText={copiedReportText}
        setCopiedReportText={setCopiedReportText}
      />

      <CloseSeasonModal
        seasonId={closingSeasonId}
        seasons={seasons}
        date={closingSeasonDate}
        setDate={setClosingSeasonDate}
        onClose={() => setClosingSeasonId(null)}
        onConfirm={(id, date) => {
          onCloseSeason(id, date);
          setClosingSeasonId(null);
        }}
      />
    </div>
  );
};
