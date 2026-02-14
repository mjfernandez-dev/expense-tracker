import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { SplitGroup, SplitExpense, Contact, GroupBalanceSummary } from '../types';
import type { QuickAddMemberData } from '../types';
import {
  getSplitGroup,
  getSplitExpenses,
  createSplitExpense,
  updateSplitExpense,
  deleteSplitExpense,
  getGroupBalances,
  getContacts,
  addGroupMember,
  removeGroupMember,
  quickAddGroupMember,
  toggleGroupActive,
} from '../services/api';
import SplitExpenseForm from '../components/split/SplitExpenseForm';
import SplitExpenseList from '../components/split/SplitExpenseList';
import GroupBalances from '../components/split/GroupBalances';
import GroupMembers from '../components/split/GroupMembers';

type TabType = 'gastos' | 'balances' | 'miembros';

function SplitGroupDetail() {
  const { groupId } = useParams<{ groupId: string }>();
  const navigate = useNavigate();

  const [group, setGroup] = useState<SplitGroup | null>(null);
  const [expenses, setExpenses] = useState<SplitExpense[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [balances, setBalances] = useState<GroupBalanceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [balancesLoading, setBalancesLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('gastos');
  const [expenseToEdit, setExpenseToEdit] = useState<SplitExpense | null>(null);
  const [expensesVersion, setExpensesVersion] = useState(0);

  const gId = parseInt(groupId || '0');

  const fetchGroup = useCallback(async () => {
    try {
      const data = await getSplitGroup(gId);
      setGroup(data);
    } catch {
      navigate('/tools/split-groups');
    }
  }, [gId, navigate]);

  const fetchExpenses = useCallback(async () => {
    const data = await getSplitExpenses(gId);
    setExpenses(data);
  }, [gId]);

  const fetchBalances = useCallback(async () => {
    try {
      setBalancesLoading(true);
      const data = await getGroupBalances(gId);
      setBalances(data);
    } catch {
      setBalances(null);
    } finally {
      setBalancesLoading(false);
    }
  }, [gId]);

  const fetchContacts = useCallback(async () => {
    const data = await getContacts();
    setContacts(data);
  }, []);

  useEffect(() => {
    const loadAll = async () => {
      setLoading(true);
      await Promise.all([fetchGroup(), fetchExpenses(), fetchContacts()]);
      setLoading(false);
    };
    loadAll();
  }, [fetchGroup, fetchExpenses, fetchContacts]);

  // Cargar balances cuando se cambia al tab o cuando cambian los gastos
  useEffect(() => {
    if (activeTab === 'balances') {
      fetchBalances();
    }
  }, [activeTab, expensesVersion, fetchBalances]);

  const handleCreateExpense = async (data: {
    descripcion: string;
    importe: number;
    paid_by_member_id: number;
    fecha: string | null;
    participant_member_ids: number[];
  }) => {
    await createSplitExpense(gId, data);
    await fetchExpenses();
    setExpensesVersion(v => v + 1);
  };

  const handleUpdateExpense = async (data: {
    descripcion: string;
    importe: number;
    paid_by_member_id: number;
    fecha: string | null;
    participant_member_ids: number[];
  }) => {
    if (!expenseToEdit) return;
    await updateSplitExpense(gId, expenseToEdit.id, data);
    setExpenseToEdit(null);
    await fetchExpenses();
    setExpensesVersion(v => v + 1);
  };

  const handleDeleteExpense = async (expenseId: number) => {
    await deleteSplitExpense(gId, expenseId);
    await fetchExpenses();
    setExpensesVersion(v => v + 1);
  };

  const handleEditExpense = (expense: SplitExpense) => {
    setExpenseToEdit(expense);
    setActiveTab('gastos');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleAddMember = async (contactId: number) => {
    await addGroupMember(gId, contactId);
    await fetchGroup();
  };

  const handleQuickAddMember = async (data: QuickAddMemberData) => {
    await quickAddGroupMember(gId, data);
    await fetchGroup();
  };

  const handleRemoveMember = async (memberId: number) => {
    await removeGroupMember(gId, memberId);
    await fetchGroup();
  };

  const handleToggleActive = async () => {
    await toggleGroupActive(gId);
    await fetchGroup();
  };

  if (loading || !group) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-blue-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400 mx-auto"></div>
          <p className="mt-4 text-slate-300">Cargando grupo...</p>
        </div>
      </div>
    );
  }

  const tabs: { key: TabType; label: string }[] = [
    { key: 'gastos', label: 'Gastos' },
    { key: 'balances', label: 'Balances' },
    { key: 'miembros', label: `Miembros (${group.members.length})` },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-blue-900 py-4 sm:py-8">
      <div className="max-w-5xl mx-auto px-3 sm:px-4">

        {/* HEADER */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl sm:text-4xl font-bold text-white">{group.nombre}</h1>
              {!group.is_active && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-500/20 text-slate-300 border border-slate-400/30">
                  Cerrado
                </span>
              )}
            </div>
            {group.descripcion && (
              <p className="text-slate-300 text-sm mt-1">{group.descripcion}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleToggleActive}
              className={`font-medium px-4 py-2 rounded-lg text-sm transition-all duration-200 ${
                group.is_active
                  ? 'border border-slate-400/70 bg-slate-800/40 text-slate-300 hover:bg-slate-800/60'
                  : 'bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-400 hover:to-indigo-400 text-white shadow-[0_0_20px_rgba(59,130,246,0.4)] border border-blue-300/70'
              }`}
            >
              {group.is_active ? 'Cerrar grupo' : 'Reabrir grupo'}
            </button>
            <button
              onClick={() => navigate('/tools/split-groups')}
              className="border border-blue-400/70 bg-slate-800/40 text-blue-300 font-medium px-5 py-2 rounded-lg hover:bg-slate-800/60 transition-all duration-200"
            >
              Volver
            </button>
          </div>
        </div>

        {/* BANNER GRUPO CERRADO */}
        {!group.is_active && (
          <div className="bg-slate-500/10 border border-slate-400/30 text-slate-300 px-4 py-3 rounded-lg mb-6 text-sm">
            Este grupo esta cerrado. Podes ver los gastos y balances pero no se pueden modificar.
          </div>
        )}

        {/* TABS */}
        <div className="flex border-b border-slate-700/70 mb-6 overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 sm:px-6 py-3 text-sm sm:text-base font-medium transition-colors whitespace-nowrap ${
                activeTab === tab.key
                  ? 'text-blue-400 font-semibold border-b-2 border-blue-400'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* TAB CONTENT */}
        {activeTab === 'gastos' && (
          <>
            {group.is_active && (
              <SplitExpenseForm
                members={group.members}
                onSubmit={expenseToEdit ? handleUpdateExpense : handleCreateExpense}
                expenseToEdit={expenseToEdit}
                onCancelEdit={() => setExpenseToEdit(null)}
              />
            )}
            <SplitExpenseList
              expenses={expenses}
              onEdit={group.is_active ? handleEditExpense : undefined}
              onDelete={group.is_active ? handleDeleteExpense : undefined}
            />
          </>
        )}

        {activeTab === 'balances' && (
          <GroupBalances
            balances={balances}
            loading={balancesLoading}
          />
        )}

        {activeTab === 'miembros' && (
          <GroupMembers
            members={group.members}
            contacts={contacts}
            onAddMember={handleAddMember}
            onRemoveMember={handleRemoveMember}
            onQuickAddMember={handleQuickAddMember}
            readOnly={!group.is_active}
          />
        )}
      </div>
    </div>
  );
}

export default SplitGroupDetail;
