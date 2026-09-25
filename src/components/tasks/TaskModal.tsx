import React, { useState } from 'react';
import { motion } from 'motion/react';
import { X, Trash2, Save, Calendar as CalendarIcon, Clock, Plus, CheckCircle2, Circle, Share2, Bell } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useSettings } from '../../contexts/SettingsContext';
import SmartConvertModal from '../smart/SmartConvertModal';
import { AnimatePresence } from 'motion/react';
import { Sparkles } from 'lucide-react';
import { combineDateTimeToISO, combineDateTimeToDate, formatToLocalDate, formatToLocalTime } from '../../lib/dateUtils';
import { ReminderOffset, TASK_REMINDER_OPTIONS, calculateReminderTime } from '../../lib/reminderUtils';
import { useAuth } from '../../App';
import { shareViaWebShare, shareToWhatsApp, formatTaskShareText } from '../../lib/shareUtils';

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
  reminderOffset?: string;
  reminderTime?: string;
  notified?: boolean;

  authorId: string;
  listId?: string;
  dueDate?: string;
  subtasks?: Subtask[];
  recurrence?: 'none' | 'weekly' | 'monthly';
  createdAt?: any;
  isSupport?: boolean;
  ticketId?: string;
  developerResponse?: string;
}

interface FamilyMember {
  id: string;
  name: string;
}

interface TaskCategory {
  id: string;
  name: string;
  color?: string;
}

interface TaskModalProps {
  task: Task | null;
  members: FamilyMember[];
  categories: TaskCategory[];
  onClose: () => void;
  onSave: (data: Partial<Task>) => void;
  onDelete?: () => void;
}

export default function TaskModal({ task, members, categories, onClose, onSave, onDelete }: TaskModalProps) {
  const { settings } = useSettings();
  const { currentUserMemberId } = useAuth();
  const [title, setTitle] = useState(task?.title || '');
  const [description, setDescription] = useState(task?.description || '');
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [listId, setListId] = useState(task?.listId || '');
  const [recurrence, setRecurrence] = useState<'none' | 'weekly' | 'monthly'>(task?.recurrence || 'none');
  const [isShared, setisShared] = useState(task?.isShared ?? true);
  
  const [noSchedule, setNoSchedule] = useState(task ? !task.dueDate : false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState(formatToLocalDate(task?.dueDate));
  const [dueTime, setDueTime] = useState(formatToLocalTime(task?.dueDate));
  const [reminderOffset, setReminderOffset] = useState<ReminderOffset>((task as any)?.reminderOffset || 'at_time');
  const [subtasks, setSubtasks] = useState<Subtask[]>(task?.subtasks || []);
  const [newSubtask, setNewSubtask] = useState('');
  const [showSmartConvert, setShowSmartConvert] = useState(false);
  const [developerResponse, setDeveloperResponse] = useState(task?.developerResponse || '');

  const handleSave = () => {
    if (!title.trim()) {
      setValidationError('Please enter a task title');
      return;
    }
    if (!noSchedule && (!dueDate || !dueTime)) {
      setValidationError('Please select both a due date and time, or check "No schedule needed".');
      return;
    }
    setValidationError(null);
    const taskDueDate = !noSchedule && dueDate ? combineDateTimeToDate(dueDate, dueTime) : null;
    const calculatedReminder = taskDueDate ? calculateReminderTime(taskDueDate, reminderOffset) : null;
    const now = new Date();
    const shouldResetNotified = calculatedReminder ? calculatedReminder > now : false;

    const taskData: Partial<Task> = {
      title: title.trim(),
      description: description.trim(),
      listId: listId || null,
      dueDate: taskDueDate as any,
      reminderTime: calculatedReminder as any, // Saved as Date object (Firestore Timestamp)
      reminderOffset: reminderOffset,
      notified: !shouldResetNotified, // Only reset to false if reminder is in the future
      subtasks,
      recurrence,
      isShared,
    };

    if (task?.isSupport) {
      taskData.developerResponse = developerResponse.trim();
    }

    onSave(taskData);
  };

  const toggleSubtask = (id: string) => {
    setSubtasks(subtasks.map(st => st.id === id ? { ...st, status: st.status === 'pending' ? 'completed' : 'pending' } : st));
  };

  const removeSubtask = (id: string) => {
    setSubtasks(subtasks.filter(st => st.id !== id));
  };

  const handleAddSubtaskManual = () => {
    if (!newSubtask.trim()) return;
    setSubtasks([...subtasks, {
      id: Math.random().toString(36).substr(2, 9),
      title: newSubtask.trim(),
      status: 'pending'
    }]);
    setNewSubtask('');
  };

  const handleShare = async () => {
    const taskDueDate = !noSchedule && dueDate ? combineDateTimeToDate(dueDate, dueTime)?.toISOString() : task?.dueDate;

    const text = formatTaskShareText(title || 'Untitled Task', description, taskDueDate, undefined);

    const shared = await shareViaWebShare({
      title: title || 'Task Details',
      text
    });
    if (!shared) {
      shareToWhatsApp(text);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-zinc-950/40 backdrop-blur-md" 
        onClick={onClose} 
      />
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative bg-white dark:bg-zinc-900 rounded-[32px] w-full max-w-xl  overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="p-4 sm:p-6 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between shrink-0">
          <h3 className="text-xl font-black text-zinc-900 dark:text-white uppercase tracking-tight">
            {task ? 'Edit Task' : 'New Task'}
          </h3>
          <div className="flex items-center gap-2">
            {task && (
              <button 
                onClick={() => setShowSmartConvert(true)}
                className="p-2.5 text-zinc-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-full transition-all"
                title="Smart Convert"
              >
                <Sparkles className="w-5 h-5" />
              </button>
            )}
            <button 
              onClick={handleShare}
              className="p-2.5 text-zinc-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-full transition-all"
              title="Share Task"
            >
              <Share2 className="w-5 h-5" />
            </button>
            {onDelete && (
              <button 
                onClick={onDelete}
                className="p-2.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-all"
                title="Delete Task"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            )}
            <button onClick={onClose} className="p-2.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors">
              <X className="w-6 h-6 text-zinc-400" />
            </button>
          </div>
        </div>

        {task?.isSupport && (
          <div className="p-4 sm:p-6 border-b border-zinc-150 dark:border-zinc-800 bg-indigo-50/20 dark:bg-indigo-950/10 space-y-3 shrink-0">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 bg-indigo-600 text-white text-[9px] font-black uppercase tracking-widest rounded-full">
                Support Ticket
              </span>
              <span className="text-xs text-zinc-500 font-bold">
                Original Ticket ID: {task.ticketId}
              </span>
            </div>
            <div className="space-y-1">
              <label className="block text-[9px] font-black text-indigo-650 dark:text-indigo-400 uppercase tracking-widest">
                Developer Response / Resolution
              </label>
              <textarea
                value={developerResponse}
                onChange={(e) => setDeveloperResponse(e.target.value)}
                placeholder="Type a response to the user... (e.g. 'This bug has been fixed in v2.1')"
                rows={3}
                className="w-full px-4 py-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-xs font-semibold text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
        )}

        <AnimatePresence>
          {showSmartConvert && (
            <SmartConvertModal 
              onClose={() => setShowSmartConvert(false)}
              content={`Title: ${title}\nDescription: ${description}`}
              originalId={task?.id}
              originalType="task"
              members={members}
              onUpdated={(newTitle, newDescription) => {
                setTitle(newTitle);
                setDescription(newDescription);
              }}
            />
          )}
        </AnimatePresence>

        <div className="flex-1 overflow-y-auto p-6 sm:p-10 space-y-8 scrollbar-hide">
          <div className="space-y-4">
            <input 
              autoFocus
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs to be done?"
              className="w-full text-2xl font-black bg-transparent border-none text-zinc-900 dark:text-white placeholder-zinc-300 focus:ring-0 outline-none p-0"
            />
            {isEditingDescription ? (
              <textarea 
                autoFocus
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={() => setIsEditingDescription(false)}
                placeholder="Add more details..."
                rows={4}
                className="w-full bg-transparent border-none text-zinc-500 dark:text-zinc-400 placeholder-zinc-300 focus:ring-0 outline-none p-0 resize-none text-sm leading-relaxed"
              />
            ) : (
              <div 
                onClick={() => setIsEditingDescription(true)}
                className="w-full min-h-[40px] text-zinc-500 dark:text-zinc-400 text-sm leading-relaxed cursor-text prose prose-sm dark:prose-invert max-w-none"
              >
                {description ? (
                  <ReactMarkdown>{description}</ReactMarkdown>
                ) : (
                  <span className="text-zinc-300">Add more details...</span>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-2 col-span-1 sm:col-span-2">
              <div className="flex items-center justify-between px-1">
                <label className="text-[9px] font-black text-zinc-400 uppercase tracking-[0.2em]">Due Date & Time</label>
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input 
                    type="checkbox"
                    checked={noSchedule}
                    onChange={(e) => {
                      setNoSchedule(e.target.checked);
                      if (e.target.checked) {
                        setDueDate('');
                        setDueTime('');
                      }
                    }}
                    className="w-3.5 h-3.5 text-violet-600 border-zinc-300 rounded focus:ring-violet-500"
                  />
                  <span className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">No schedule needed</span>
                </label>
              </div>
              {!noSchedule ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap sm:flex-nowrap gap-2">
                    <div className="flex-1 min-w-[140px] relative">
                      <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
                      <input 
                        type="date"
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 bg-zinc-50 dark:bg-zinc-800 border-none rounded-2xl text-sm font-bold text-zinc-700 dark:text-zinc-200 focus:ring-2 focus:ring-violet-500"
                      />
                    </div>
                    <div className="flex-1 min-w-[100px] relative">
                      <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
                      <input 
                        type="time"
                        value={dueTime}
                        onChange={(e) => setDueTime(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 bg-zinc-50 dark:bg-zinc-800 border-none rounded-2xl text-sm font-bold text-zinc-700 dark:text-zinc-200 focus:ring-2 focus:ring-violet-500"
                      />
                    </div>
                  </div>

                  <div className="relative">
                    <Bell className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
                    <select
                      value={reminderOffset}
                      onChange={(e) => setReminderOffset(e.target.value as ReminderOffset)}
                      className="w-full pl-10 pr-4 py-2.5 bg-zinc-50 dark:bg-zinc-800 border-none rounded-2xl text-xs font-bold text-zinc-700 dark:text-zinc-200 focus:ring-2 focus:ring-violet-500 appearance-none cursor-pointer"
                    >
                      {TASK_REMINDER_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              ) : (
                <div className="py-3 px-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl text-xs font-bold text-zinc-400 dark:text-zinc-500 italic text-center">
                  This task will not be scheduled on the calendar.
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-[9px] font-black text-zinc-400 uppercase tracking-[0.2em] px-1">Repeat</label>
              <div className="flex gap-2">
                {['none', 'weekly', 'monthly'].map((freq) => (
                  <button
                    key={freq}
                    type="button"
                    onClick={() => setRecurrence(freq as any)}
                    className={`flex-1 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border-none ${recurrence === freq ? 'text-white ' : 'bg-zinc-50 dark:bg-zinc-800 text-zinc-400 hover:bg-zinc-100'}`}
                    style={recurrence === freq ? { backgroundColor: settings.themeColor } : {}}
                  >
                    {freq}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[9px] font-black text-zinc-400 uppercase tracking-[0.2em] px-1">Category</label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setListId('')}
                  className={`flex-1 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border-none ${!listId ? 'bg-zinc-900 text-white ' : 'bg-zinc-50 dark:bg-zinc-800 text-zinc-400 hover:bg-zinc-100'}`}
                >
                  None
                </button>
                {categories.map(cat => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setListId(cat.id)}
                    className={`flex-1 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border-none ${listId === cat.id ? 'text-white ' : 'bg-zinc-50 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-100'}`}
                    style={listId === cat.id ? { backgroundColor: cat.color || settings.themeColor } : { borderBottom: `3px solid ${cat.color || 'transparent'}` }}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-[9px] font-black text-zinc-400 uppercase tracking-[0.2em] px-1">Subtasks</label>
            <div className="space-y-2">
              {subtasks.map(st => (
                <div key={st.id} className="flex items-center gap-3 group/st">
                  <button 
                    onClick={() => toggleSubtask(st.id)} 
                    className="shrink-0 transition-colors"
                    style={{ color: st.status === 'completed' ? settings.themeColor : undefined }}
                  >
                    {st.status === 'completed' ? <CheckCircle2 className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
                  </button>
                  <span className={`text-sm flex-1 ${st.status === 'completed' ? 'line-through text-zinc-400' : 'text-zinc-700 dark:text-zinc-300'}`}>
                    {st.title}
                  </span>
                  <button onClick={() => removeSubtask(st.id)} className="opacity-0 group-hover/st:opacity-100 p-1 text-zinc-300 hover:text-red-500 transition-all">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <div className="flex items-center gap-3 pt-2">
                <button onClick={handleAddSubtaskManual}>
                  <Plus className="w-5 h-5 text-zinc-300" />
                </button>
                <input 
                  type="text"
                  value={newSubtask}
                  onChange={(e) => setNewSubtask(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddSubtaskManual();
                    }
                  }}
                  placeholder="Add a step..."
                  className="flex-1 bg-transparent border-none text-sm text-zinc-600 dark:text-zinc-400 placeholder-zinc-300 focus:ring-0 outline-none p-0"
                />
              </div>
            </div>
          </div>
        {validationError && (
          <div className="px-6 py-3 bg-red-50 dark:bg-red-950/20 text-red-500 text-xs font-bold text-center border-t border-red-100 dark:border-red-950/40">
            {validationError}
          </div>
        )}
        </div>

        <div className="p-6 bg-zinc-50 dark:bg-zinc-900/50 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            {onDelete && (
              <button 
                onClick={onDelete}
                className="flex items-center gap-2 px-5 py-3 text-red-500 dark:text-red-400 font-black text-xs uppercase tracking-[0.2em] rounded-2xl hover:bg-red-50 dark:hover:bg-red-900/20 transition-all active:scale-95"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            )}
          </div>
          <button 
            onClick={handleSave}
            className="flex items-center gap-2 px-8 py-3 text-white font-black text-xs uppercase tracking-[0.2em] rounded-2xl hover:opacity-90 transition-all  active:scale-95"
            style={{ backgroundColor: settings.themeColor }}
          >
            <Save className="w-4 h-4" />
            {task ? 'Update Task' : 'Create Task'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
