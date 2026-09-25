import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../App';
import { db } from '../../lib/firebase';
import { getFirstName } from '../../utils/nameUtils';
import { collection, query, onSnapshot, addDoc, updateDoc, doc, deleteDoc, serverTimestamp, where, or } from 'firebase/firestore';
import {
  Plus,
  CheckCircle2,
  CheckSquare,
  Circle,
  Trash2,
  StickyNote,
  Users,
  User as UserIcon,
  X,
  Camera,
  Calendar as CalendarIcon,
  Clock,
  ChevronRight,
  Save,
  Check,
  Repeat,
  Code,
  Copy
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, isValid, addWeeks, addMonths } from 'date-fns';
import { useSettings } from '../../contexts/SettingsContext';
import { processSmartCapture } from '../../services/smartCaptureService'; 
import { logger } from '../../services/logger';
import { ensureDate } from '../../lib/dateUtils';
import TaskModal from './TaskModal';
import SupportTicketModal from './SupportTicketModal';
import NoteModal from './NoteModal';
import ConfirmModal from '../common/ConfirmModal';
import CameraChoiceModal from '../common/CameraChoiceModal';
import SmartCaptureModal from '../smart/SmartCaptureModal';
import PageHeader from '../common/PageHeader';

interface Subtask {
  id: string;
  title: string;
  status: 'pending' | 'completed';
}

interface Task {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'completed';
  isShared: boolean;
  assignedTo?: string;
  authorId: string;
  listId?: string;
  dueDate?: string;
  subtasks?: Subtask[];
  recurrence?: 'none' | 'weekly' | 'monthly';
  createdAt?: any;
  reminderTime?: string;
  notified?: boolean;
  reminderOffset?: string;
  isSupport?: boolean;
  ticketId?: string;
  developerResponse?: string;
}

interface FamilyMember {
  id: string;
  name: string;
  role: string;
}

interface TaskCategory {
  id: string;
  name: string;
  color?: string;
  authorId: string;
}

interface Note {
  id: string;
  title?: string;
  content: string;
  color: string;
  isShared: boolean;
  authorId: string;
  createdAt?: any;
  reminderTime?: string;
  notified?: boolean;
  reminderOffset?: string;
}

export default function TasksView({ 
  initialItemId, 
  onInitialItemHandled,
  supportOnly = false
}: { 
  initialItemId?: string | null, 
  onInitialItemHandled?: () => void,
  supportOnly?: boolean 
}) {
  const { tradeUserId, user } = useAuth();
  const { settings } = useSettings();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [categories, setCategories] = useState<TaskCategory[]>([]);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [activeTab, setActiveTab] = useState<'tasks' | 'notes'>('tasks');

  // Handle Deep Links
  useEffect(() => {
    if (!initialItemId) return;

    // Check tasks
    const task = tasks.find(t => t.id === initialItemId);
    if (task) {
      setTaskToEdit(task);
      setActiveTab('tasks');
      window.history.replaceState({ ...window.history.state, tab: 'tasks' }, '');
      onInitialItemHandled?.();
      return;
    }

    // Check notes
    const note = notes.find(n => n.id === initialItemId);
    if (note) {
      setNoteToEdit(note);
      setActiveTab('notes');
      window.history.replaceState({ ...window.history.state, tab: 'notes' }, '');
      onInitialItemHandled?.();
      return;
    }
  }, [tasks, notes, initialItemId, onInitialItemHandled]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  const [isAddingTask, setIsAddingTask] = useState(false);
  const [taskToEdit, setTaskToEdit] = useState<Task | null>(null);
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [noteToEdit, setNoteToEdit] = useState<Note | null>(null);
  const [showCaptureOptions, setShowCaptureOptions] = useState(false);
  const [showSmartCapture, setShowSmartCapture] = useState(false);
  const [smartCaptureMode, setSmartCaptureMode] = useState<'select' | 'camera' | 'file' | 'document'>('select');
  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => { }
  });

  useEffect(() => {
    if (!tradeUserId) return;

    const tasksRef = collection(db, 'trade_users', tradeUserId, 'tasks');
    const notesRef = collection(db, 'trade_users', tradeUserId, 'notes');
    const categoriesRef = collection(db, 'trade_users', tradeUserId, 'taskCategories');

    const tasksQuery = query(
      tasksRef, 
      or(
        where('isShared', '==', true),
        where('authorId', '==', user.uid)
      )
    );
    
    const notesQuery = query(
      notesRef, 
      or(
        where('isShared', '==', true),
        where('authorId', '==', user.uid)
      )
    );

    const unsubTasks = onSnapshot(tasksQuery, (snap) => {
      let fetchedTasks = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Task));
      if (supportOnly) {
        fetchedTasks = fetchedTasks.filter(t => t.isSupport);
      }
      setTasks(fetchedTasks);
    });

    const unsubNotes = onSnapshot(notesQuery, (snap) => {
      setNotes(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Note)));
    });

    const unsubCategories = onSnapshot(categoriesRef, (snap) => {
      setCategories(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as TaskCategory)));
    });

    const membersRef = collection(db, 'trade_users', tradeUserId, 'members');
    const unsubMembers = onSnapshot(membersRef, (snap) => {
      setMembers(snap.docs.map(doc => {
        const d = doc.data();
        return {
          id: doc.id,
          ...d,
          name: d.displayName || d.name || d.email
        } as FamilyMember;
      }));
    });

    return () => { unsubTasks(); unsubNotes(); unsubCategories(); unsubMembers(); };
  }, [tradeUserId]);

  const handleChoice = (choice: 'camera' | 'file' | 'document') => {
    setSmartCaptureMode(choice);
    setShowCaptureOptions(false);
    setShowSmartCapture(true);
  };

  const toggleTask = async (task: Task) => {
    if (!tradeUserId) return;
    const newStatus = task.status === 'pending' ? 'completed' : 'pending';

    try {
      const isCompleted = newStatus === 'completed';
      const reminderDate = task.reminderTime ? ensureDate(task.reminderTime) : null;
      const shouldResetNotified = !isCompleted && reminderDate && reminderDate > new Date();

      await updateDoc(doc(db, 'trade_users', tradeUserId, 'tasks', task.id), { 
        status: newStatus,
        notified: isCompleted ? true : (shouldResetNotified ? false : (task.notified ?? false))
      });

      if (task.isSupport && task.ticketId) {
        await updateDoc(doc(db, 'support_tickets', task.ticketId), {
          status: newStatus === 'completed' ? 'resolved' : 'open'
        });
      }

      if (newStatus === 'completed' && task.recurrence && task.recurrence !== 'none') {
        const currentDueDate = ensureDate(task.dueDate);
        const nextDueDate = task.recurrence === 'weekly' ? addWeeks(currentDueDate, 1) : addMonths(currentDueDate, 1);

        await addDoc(collection(db, 'trade_users', tradeUserId, 'tasks'), {
          ...task,
          id: undefined,
          status: 'pending',
          dueDate: nextDueDate,
          reminderTime: nextDueDate,
          notified: false,
          createdAt: serverTimestamp()
        });
      }
    } catch (error) {
      logger.error('Error toggling task', error);
    }
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tradeUserId || !user || !newCategoryName.trim()) return;
    await addDoc(collection(db, 'trade_users', tradeUserId, 'taskCategories'), {
      name: newCategoryName.trim(),
      authorId: user.uid,
      color: '#3b82f6'
    });
    setNewCategoryName('');
    setIsAddingCategory(false);
  };

  const handleDeleteCategory = async (id: string) => {
    if (!tradeUserId) return;
    setConfirmConfig({
      isOpen: true,
      title: 'Delete Category',
      message: 'Are you sure? Tasks in this category will become unassigned.',
      onConfirm: async () => {
        await deleteDoc(doc(db, 'trade_users', tradeUserId, 'taskCategories', id));
        if (selectedCategoryId === id) setSelectedCategoryId(null);
      }
    });
  };

  if (!tradeUserId) return null;

  return (
    <div className="max-w-4xl mx-auto pb-40 px-1 sm:px-0">
      <PageHeader
        icon={activeTab === 'tasks' ? CheckSquare : StickyNote}
        title={supportOnly ? 'Support' : (activeTab === 'tasks' ? 'Tasks' : 'Notes')}
        subtitle={supportOnly ? 'System Tickets' : (activeTab === 'tasks' ? 'Organise Your Trade Work' : 'Thoughts & Reminders')}

        extra={
          !supportOnly && (
            <div className="bg-gradient-to-r from-emerald-500/10 to-blue-500/10 border border-emerald-500/20 dark:border-emerald-400/10 p-1 rounded-2xl flex gap-1">
              <button 
                onClick={() => {
                  setActiveTab('tasks');
                  window.history.replaceState({ ...window.history.state, tab: 'tasks' }, '');
                }}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  activeTab === 'tasks' 
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' 
                    : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                Tasks
              </button>
              <button 
                onClick={() => {
                  setActiveTab('notes');
                  window.history.replaceState({ ...window.history.state, tab: 'notes' }, '');
                }}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  activeTab === 'notes' 
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' 
                    : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                Notes
              </button>
            </div>
          )
        }
      />



      {activeTab === 'tasks' ? (
        <div className="space-y-4">
          {!supportOnly && (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setSelectedCategoryId(null)} className={`px-4 py-2 rounded-xl text-sm font-bold ${!selectedCategoryId ? 'text-white' : 'bg-zinc-100 text-zinc-500'}`} style={!selectedCategoryId ? { backgroundColor: settings.themeColor } : {}}>All Tasks</button>
                {categories.map(cat => (
                  <div key={cat.id} className="group relative">
                    <button onClick={() => setSelectedCategoryId(cat.id)} className={`px-4 py-2 rounded-xl text-sm font-bold ${selectedCategoryId === cat.id ? 'text-white' : 'bg-blue-50 text-blue-600'}`} style={selectedCategoryId === cat.id ? { backgroundColor: settings.themeColor } : {}}>{cat.name}</button>
                    <button onClick={() => handleDeleteCategory(cat.id)} className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white flex items-center justify-center rounded-full opacity-0 group-hover:opacity-100 transition-opacity"><X className="w-2.5 h-2.5" /></button>
                  </div>
                ))}
                
                {isAddingCategory ? (
                  <form onSubmit={handleAddCategory} className="flex gap-2">
                    <input
                      autoFocus
                      type="text"
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      placeholder="Category name..."
                      className="px-3 py-2 rounded-xl text-sm border-none bg-zinc-100 focus:ring-2 focus:ring-emerald-500 w-32"
                    />
                    <div className="flex items-center gap-1">
                      <button type="submit" disabled={!newCategoryName.trim()} className="p-2 bg-emerald-500 text-white rounded-xl disabled:opacity-50"><Check className="w-4 h-4" /></button>
                      <button type="button" onClick={() => { setIsAddingCategory(false); setNewCategoryName(''); }} className="p-2 bg-zinc-100 text-zinc-500 rounded-xl"><X className="w-4 h-4" /></button>
                    </div>
                  </form>
                ) : (
                  <button onClick={() => setIsAddingCategory(true)} className="p-2 bg-zinc-100 rounded-xl"><Plus className="w-4 h-4 text-zinc-400" /></button>
                )}
              </div>

              {tasks.some(t => t.status === 'completed') && (
                <button 
                  onClick={() => {
                    setConfirmConfig({
                      isOpen: true,
                      title: 'Clean Up Completed',
                      message: 'Are you sure you want to delete all completed tasks?',
                      confirmLabel: 'Delete All',
                      onConfirm: async () => {
                        const completed = tasks.filter(t => t.status === 'completed');
                        for (const t of completed) {
                          await deleteDoc(doc(db, 'trade_users', tradeUserId, 'tasks', t.id));
                        }
                      }
                    });
                  }}
                  className="flex items-center gap-2 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                  Clear Completed
                </button>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {tasks
              .filter(t => !selectedCategoryId || t.listId === selectedCategoryId)
              .sort((a, b) => {
                // 1. If one is completed and other isn't, completed goes to bottom
                if (a.status !== b.status) {
                  return a.status === 'completed' ? 1 : -1;
                }
                
                // 2. If both have same status (both pending or both completed)
                // Sort by date, nearest first
                if (a.dueDate && b.dueDate) {
                  return ensureDate(a.dueDate).getTime() - ensureDate(b.dueDate).getTime();
                }
                
                // Items with dates come before items without dates
                if (a.dueDate) return -1;
                if (b.dueDate) return 1;
                
                return 0;
              })
              .map(task => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onToggle={() => toggleTask(task)}
                  onEdit={() => setTaskToEdit(task)}
                  members={members}
                  categories={categories}
                  selectedCategoryId={selectedCategoryId}
                  settings={settings}
                  setConfirmConfig={setConfirmConfig}
                />
              ))}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {notes.map(note => (
            <div 
              key={note.id} 
              onClick={() => setNoteToEdit(note)} 
              className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 rounded-2xl transition-all group cursor-pointer relative overflow-hidden pl-6 active:scale-[0.98] min-h-[140px]"
              style={{ backgroundColor: note.color || '#fef3c7' }}
            >
              <div 
                className="absolute left-0 top-0 bottom-0 w-1.5 opacity-40" 
                style={{ backgroundColor: '#000' }} 
              />
              <div className="relative">
                {note.title && <h3 className="font-black text-zinc-900 mb-2 truncate">{note.title}</h3>}
                <p className="font-medium text-sm text-zinc-800 whitespace-pre-wrap line-clamp-6">{note.content}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {(isAddingTask || taskToEdit) && (
          taskToEdit?.isSupport ? (
            <SupportTicketModal
              task={taskToEdit}
              onClose={() => { setIsAddingTask(false); setTaskToEdit(null); }}
              onSave={async (data) => {
                await updateDoc(doc(db, 'trade_users', tradeUserId!, 'tasks', taskToEdit.id), data);
                if (taskToEdit.ticketId) {
                  const ticketStatus = data.status === 'completed' ? 'resolved' : 'open';
                  await updateDoc(doc(db, 'support_tickets', taskToEdit.ticketId), {
                    status: ticketStatus,
                    developerResponse: data.developerResponse || ''
                  });
                }
                setIsAddingTask(false); setTaskToEdit(null);
              }}
              onDelete={async () => {
                setConfirmConfig({
                  isOpen: true,
                  title: 'Delete Ticket',
                  message: 'Are you sure you want to delete this support ticket?',
                  onConfirm: async () => {
                    await deleteDoc(doc(db, 'trade_users', tradeUserId!, 'tasks', taskToEdit.id));
                    if (taskToEdit.ticketId) {
                      await deleteDoc(doc(db, 'support_tickets', taskToEdit.ticketId));
                    }
                    setTaskToEdit(null);
                  }
                });
              }}
            />
          ) : (
            <TaskModal
              task={taskToEdit}
              members={members}
              categories={categories}
              onClose={() => { setIsAddingTask(false); setTaskToEdit(null); }}
              onSave={async (data) => {
                if (taskToEdit) {
                  await updateDoc(doc(db, 'trade_users', tradeUserId, 'tasks', taskToEdit.id), data);
                } else {
                  await addDoc(collection(db, 'trade_users', tradeUserId, 'tasks'), { 
                    isShared: true, // Default to true
                    ...data, 
                    status: 'pending', 
                    authorId: user?.uid, 
                    createdAt: serverTimestamp() 
                  });
                }
                setIsAddingTask(false); setTaskToEdit(null);
              }}
              onDelete={taskToEdit ? async () => {
                setConfirmConfig({
                  isOpen: true,
                  title: 'Delete Task',
                  message: 'Are you sure you want to delete this task?',
                  onConfirm: async () => {
                    await deleteDoc(doc(db, 'trade_users', tradeUserId!, 'tasks', taskToEdit.id));
                    setTaskToEdit(null);
                  }
                });
              } : undefined}
            />
          )
        )}
        {(isAddingNote || noteToEdit) && (
          <NoteModal
            note={noteToEdit}
            onClose={() => { setIsAddingNote(false); setNoteToEdit(null); }}
            onSave={async (data) => {
              if (!tradeUserId || !user) return;
              if (noteToEdit) {
                await updateDoc(doc(db, 'trade_users', tradeUserId, 'notes', noteToEdit.id), data);
              } else {
                await addDoc(collection(db, 'trade_users', tradeUserId, 'notes'), {
                  ...data,
                  authorId: user.uid,
                  createdAt: serverTimestamp()
                });
              }
              setIsAddingNote(false);
              setNoteToEdit(null);
            }}
            onDelete={noteToEdit ? async () => {
              setConfirmConfig({
                isOpen: true,
                title: 'Delete Note',
                message: 'Are you sure you want to delete this note?',
                onConfirm: async () => {
                  await deleteDoc(doc(db, 'trade_users', tradeUserId!, 'notes', noteToEdit.id));
                  setNoteToEdit(null);
                }
              });
            } : undefined}
            members={members}
          />
        )}
      </AnimatePresence>

      <ConfirmModal
        isOpen={confirmConfig.isOpen} title={confirmConfig.title} message={confirmConfig.message} confirmLabel={confirmConfig.confirmLabel}
        onConfirm={() => { confirmConfig.onConfirm(); setConfirmConfig(prev => ({ ...prev, isOpen: false })); }}
        onClose={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
      />

      <CameraChoiceModal 
        isOpen={showCaptureOptions} 
        onClose={() => setShowCaptureOptions(false)} 
        onChoice={handleChoice} 
      />

      <AnimatePresence>
        {showSmartCapture && (
          <SmartCaptureModal 
            onClose={() => setShowSmartCapture(false)} 
            initialMode={smartCaptureMode}
            members={members}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function getMemberColor(memberId?: string) {
  const colors = [
    { bg: 'bg-rose-50 dark:bg-rose-950/20', text: 'text-rose-600 dark:text-rose-400', border: 'border border-rose-100 dark:border-rose-900/30', accent: 'bg-rose-500' },
    { bg: 'bg-blue-50 dark:bg-blue-950/20', text: 'text-blue-600 dark:text-blue-400', border: 'border border-blue-100 dark:border-blue-900/30', accent: 'bg-blue-500' },
    { bg: 'bg-emerald-50 dark:bg-emerald-950/20', text: 'text-emerald-600 dark:text-emerald-400', border: 'border border-emerald-100 dark:border-emerald-900/30', accent: 'bg-emerald-500' },
    { bg: 'bg-amber-50 dark:bg-amber-950/20', text: 'text-amber-600 dark:text-amber-400', border: 'border border-amber-100 dark:border-amber-900/30', accent: 'bg-amber-500' },
    { bg: 'bg-indigo-50 dark:bg-indigo-950/20', text: 'text-indigo-600 dark:text-indigo-400', border: 'border border-indigo-100 dark:border-indigo-900/30', accent: 'bg-indigo-500' },
    { bg: 'bg-purple-50 dark:bg-purple-950/20', text: 'text-purple-600 dark:text-purple-400', border: 'border border-purple-100 dark:border-purple-900/30', accent: 'bg-purple-500' },
    { bg: 'bg-cyan-50 dark:bg-cyan-950/20', text: 'text-cyan-600 dark:text-cyan-400', border: 'border border-cyan-100 dark:border-cyan-900/30', accent: 'bg-cyan-500' },
    { bg: 'bg-pink-50 dark:bg-pink-950/20', text: 'text-pink-600 dark:text-pink-400', border: 'border border-pink-100 dark:border-pink-900/30', accent: 'bg-pink-500' },
  ];
  if (!memberId || memberId === 'all') {
    return { bg: 'bg-zinc-50 dark:bg-zinc-800/50', text: 'text-zinc-600 dark:text-zinc-400', border: 'border border-zinc-150 dark:border-zinc-800', accent: 'bg-zinc-400' };
  }
  const idStr = memberId;
  if (typeof idStr !== 'string') {
    return { bg: 'bg-zinc-50 dark:bg-zinc-800/50', text: 'text-zinc-600 dark:text-zinc-400', border: 'border border-zinc-150 dark:border-zinc-800', accent: 'bg-zinc-400' };
  }
  let hash = 0;
  for (let i = 0; i < idStr.length; i++) {
    hash = idStr.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % colors.length;
  return colors[index];
}

function TaskCard({ task, onToggle, onEdit, members, categories, selectedCategoryId, settings, setConfirmConfig }: any) {
  const dateStr = task.dueDate ? format(ensureDate(task.dueDate), 'd MMM yyyy HH:mm') : null;
  const assignedMember = members.find((m: any) => m.id === task.assignedTo);
  const category = categories.find((c: any) => c.id === task.listId);
  
  // Custom color handling
  const accentColor = assignedMember?.color || category?.color || '#94a3b8';
  
  return (
    <div onClick={onEdit} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 rounded-2xl transition-all group cursor-pointer relative overflow-hidden pl-5">
      <div 
        className="absolute left-0 top-0 bottom-0 w-1.5" 
        style={{ backgroundColor: accentColor }}
      />
      <div className="flex items-start gap-3">
        <button onClick={(e) => { e.stopPropagation(); onToggle(); }} className="mt-0.5 shrink-0">
          {task.status === 'completed' ? <CheckCircle2 className="w-5 h-5" style={{ color: settings.themeColor }} /> : <Circle className="w-5 h-5 text-zinc-300" />}
        </button>
        <div className="flex-1 min-w-0">
          <span className={`block font-bold text-sm ${task.status === 'completed' ? 'line-through text-zinc-400' : 'text-zinc-900 dark:text-zinc-100'}`}>{task.title}</span>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {dateStr && (
              <div className="flex items-center gap-1.5 text-zinc-400 text-[10px] uppercase font-bold whitespace-nowrap overflow-visible">
                <CalendarIcon className="w-3 h-3 shrink-0" />
                {dateStr}
              </div>
            )}
            {assignedMember && (
              <div 
                className="flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-widest border"
                style={{
                  backgroundColor: accentColor + '15',
                  color: accentColor,
                  borderColor: accentColor + '33'
                }}
              >
                <UserIcon className="w-2.5 h-2.5" />
                {getFirstName(assignedMember.name || assignedMember.displayName || assignedMember.email)}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
