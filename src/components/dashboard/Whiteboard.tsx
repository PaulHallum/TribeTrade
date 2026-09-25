import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Pin, 
  Trash2, 
  Eraser, 
  Edit2, 
  Check, 
  ChevronDown, 
  ChevronUp, 
  X, 
  Send 
} from 'lucide-react';
import { db } from '../../lib/firebase';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  deleteDoc, 
  doc, 
  updateDoc, 
  serverTimestamp, 
  query, 
  orderBy,
  writeBatch
} from 'firebase/firestore';
import { useAuth } from '../../App';
import { useToast } from '../../contexts/ToastContext';
import { getFirstName } from '../../utils/nameUtils';
import ConfirmModal from '../common/ConfirmModal';
import ReactMarkdown from 'react-markdown';

export interface WhiteboardNote {
  id: string;
  content: string;
  color?: string;
  pinned?: boolean;
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  createdAt?: any;
}

export const MAX_NOTE_LENGTH = 400;

export const QUICK_OPTIONS = [
  { label: 'Important', icon: '🚨', prefix: '🚨 **Important:** ' },
  { label: 'Reminder', icon: '⏰', prefix: '⏰ **Reminder:** ' },
  { label: 'Don\'t Forget', icon: '🛒', prefix: '🛒 **Don\'t forget:** ' },
  { label: 'Please Call', icon: '📞', prefix: '📞 **Please call:** ' },
  { label: 'Whereabouts', icon: '📍', prefix: '📍 **Whereabouts:** ' },
  { label: 'Site Note', icon: '🏗️', prefix: '🏗️ **Site Note:** ' },
];

export default function Whiteboard({ members = [] }: { members?: any[] }) {
  const { tradeUserId, user } = useAuth();
  const { showToast } = useToast();
  
  const [notes, setNotes] = useState<WhiteboardNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [newContent, setNewContent] = useState('');
  const [isInputExpanded, setIsInputExpanded] = useState(false);
  const [isBoardExpanded, setIsBoardExpanded] = useState(true);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [showWipeConfirm, setShowWipeConfirm] = useState(false);
  const [showNotifyPrompt, setShowNotifyPrompt] = useState(false);
  const [pendingContent, setPendingContent] = useState('');
  const [isPosting, setIsPosting] = useState(false);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const editInputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea height to fit content dynamically
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = `${Math.max(isInputExpanded ? 64 : 38, inputRef.current.scrollHeight)}px`;
    }
  }, [newContent, isInputExpanded]);

  useEffect(() => {
    if (editInputRef.current) {
      editInputRef.current.style.height = 'auto';
      editInputRef.current.style.height = `${Math.max(50, editInputRef.current.scrollHeight)}px`;
    }
  }, [editContent, editingNoteId]);

  // Subscribe to real-time notes
  useEffect(() => {
    if (!tradeUserId) return;

    const whiteboardRef = collection(db, 'trade_users', tradeUserId, 'whiteboard');

    const unsubscribe = onSnapshot(whiteboardRef, (snapshot) => {
      const fetchedNotes = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as WhiteboardNote[];

      // Sort with pinned first, then newest
      fetchedNotes.sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        const timeA = a.createdAt?.toMillis?.() || (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
        const timeB = b.createdAt?.toMillis?.() || (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
        return timeB - timeA;
      });

      setNotes(fetchedNotes);
      setLoading(false);
    }, (error) => {
      console.error('Error fetching whiteboard notes:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [tradeUserId]);

  // Current user's member display name
  const currentMember = members.find(m => m.userId === user?.uid || m.id === user?.uid);
  const authorName = currentMember?.name || user?.displayName || 'Trade Member';
  const authorAvatar = currentMember?.avatarUrl || user?.photoURL || '';

  // Trigger push notification to other team members via server
  const notifyTeamMembers = async (textSnippet: string, noteId: string) => {
    try {
      const token = await user?.getIdToken();
      if (!token) return;

      await fetch('/api/whiteboard/notify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          authorName: getFirstName(authorName),
          textSnippet,
          noteId
        })
      });
    } catch (err) {
      console.warn('Failed to dispatch whiteboard push notification:', err);
    }
  };

  const onInitiateAddNote = () => {
    if (!newContent.trim() || !tradeUserId || !user) return;
    setPendingContent(newContent.trim());
    setShowNotifyPrompt(true);
  };

  const handleConfirmAddNote = async (shouldNotify: boolean) => {
    if (!pendingContent.trim() || !tradeUserId || !user) return;

    try {
      setIsPosting(true);
      const contentToSave = pendingContent.trim();
      const whiteboardRef = collection(db, 'trade_users', tradeUserId, 'whiteboard');
      
      const docRef = await addDoc(whiteboardRef, {
        content: contentToSave,
        color: 'white',
        pinned: false,
        authorId: user.uid,
        authorName: authorName,
        authorAvatar: authorAvatar,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      setNewContent('');
      setPendingContent('');
      setShowNotifyPrompt(false);
      setIsInputExpanded(false);
      setIsBoardExpanded(true);

      if (shouldNotify) {
        showToast('Note posted & team notified!', 'success');
        notifyTeamMembers(contentToSave, docRef.id);
      } else {
        showToast('Note posted to the whiteboard!', 'success');
      }
    } catch (error: any) {
      console.error('Failed to add note to whiteboard:', error);
      showToast('Could not add note. Please try again.', 'error');
    } finally {
      setIsPosting(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!tradeUserId) return;
    try {
      await deleteDoc(doc(db, 'trade_users', tradeUserId, 'whiteboard', noteId));
      showToast('Note removed from whiteboard', 'info');
    } catch (error: any) {
      console.error('Failed to delete note:', error);
      showToast('Could not delete note.', 'error');
    }
  };

  const handleTogglePin = async (note: WhiteboardNote) => {
    if (!tradeUserId) return;
    try {
      await updateDoc(doc(db, 'trade_users', tradeUserId, 'whiteboard', note.id), {
        pinned: !note.pinned,
        updatedAt: serverTimestamp()
      });
    } catch (error: any) {
      console.error('Failed to toggle pin:', error);
    }
  };

  const handleSaveEdit = async (noteId: string) => {
    if (!tradeUserId || !editContent.trim()) return;
    try {
      await updateDoc(doc(db, 'trade_users', tradeUserId, 'whiteboard', noteId), {
        content: editContent.trim(),
        updatedAt: serverTimestamp()
      });
      setEditingNoteId(null);
      setEditContent('');
      showToast('Note updated', 'success');
    } catch (error: any) {
      console.error('Failed to save edit:', error);
      showToast('Could not update note.', 'error');
    }
  };

  const handleToggleCheckboxInContent = async (note: WhiteboardNote, lineIndex: number) => {
    if (!tradeUserId) return;
    const lines = note.content.split('\n');
    if (lineIndex < 0 || lineIndex >= lines.length) return;

    let targetLine = lines[lineIndex];
    if (targetLine.includes('[ ]')) {
      targetLine = targetLine.replace('[ ]', '[x]');
    } else if (targetLine.includes('[x]')) {
      targetLine = targetLine.replace('[x]', '[ ]');
    } else if (targetLine.includes('[X]')) {
      targetLine = targetLine.replace('[X]', '[ ]');
    }

    lines[lineIndex] = targetLine;
    const updatedContent = lines.join('\n');

    try {
      await updateDoc(doc(db, 'trade_users', tradeUserId, 'whiteboard', note.id), {
        content: updatedContent,
        updatedAt: serverTimestamp()
      });
    } catch (error: any) {
      console.error('Failed to toggle checklist item:', error);
    }
  };

  const handleWipeBoard = async () => {
    if (!tradeUserId || notes.length === 0) return;
    try {
      const batch = writeBatch(db);
      notes.forEach((note) => {
        batch.delete(doc(db, 'trade_users', tradeUserId, 'whiteboard', note.id));
      });
      await batch.commit();
      setShowWipeConfirm(false);
      showToast('Whiteboard wiped clean!', 'success');
    } catch (error: any) {
      console.error('Failed to wipe whiteboard:', error);
      showToast('Could not wipe whiteboard.', 'error');
    }
  };

  // Helper to format timestamps nicely (British format)
  const formatNoteTime = (timestamp: any) => {
    if (!timestamp) return 'Just now';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp.seconds * 1000);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));

    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}h ago`;
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  };

  const insertQuickOption = (prefix: string) => {
    setNewContent(prev => {
      if (!prev.trim()) return prefix;
      if (prev.startsWith(prefix)) return prev;
      return `${prefix}${prev}`;
    });
    setIsInputExpanded(true);
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        const len = inputRef.current.value.length;
        inputRef.current.setSelectionRange(len, len);
      }
    }, 50);
  };

  return (
    <section className="mb-8 relative">
      {/* Expandable Whiteboard Card */}
      <motion.div 
        layout
        transition={{ layout: { duration: 0.25, ease: "easeInOut" } }}
        className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm relative overflow-hidden transition-all"
      >
        {/* Left Color Indicator Strip */}
        <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-amber-400 dark:bg-amber-500" />

        <div className="p-4 sm:p-5 pl-5 sm:pl-6">
          {/* Header Bar */}
          <div className="flex items-center justify-between gap-3">
            <div 
              onClick={() => {
                if (notes.length > 0) setIsBoardExpanded(!isBoardExpanded);
                else setIsInputExpanded(true);
              }}
              className="flex items-center gap-3.5 cursor-pointer min-w-0 flex-1 group select-none"
            >
              <div className="p-2.5 bg-amber-50 dark:bg-amber-950/40 rounded-xl text-amber-500 shrink-0 group-hover:scale-105 transition-transform">
                <span className="text-xl leading-none">📌</span>
              </div>
              
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-base text-zinc-900 dark:text-zinc-100 truncate">
                    Whiteboard
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border border-amber-200/50 dark:border-amber-800/30 shrink-0">
                    {notes.length === 0 ? 'Empty' : `${notes.length} ${notes.length === 1 ? 'note' : 'notes'}`}
                  </span>
                </div>
                <span className="text-xs text-zinc-400 dark:text-zinc-500 block truncate">
                  {notes.length === 0 
                    ? 'Temporary note or reminder' 
                    : isBoardExpanded 
                      ? 'Tap to minimize whiteboard' 
                      : 'Tap to view all notes & messages'}
                </span>
              </div>
            </div>

            {/* Header Right Actions */}
            <div className="flex items-center gap-1.5 shrink-0">
              {notes.length > 0 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowWipeConfirm(true);
                  }}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-all cursor-pointer"
                  title="Wipe board clean"
                >
                  <Eraser className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Wipe</span>
                </button>
              )}

              {notes.length > 0 && (
                <button
                  onClick={() => setIsBoardExpanded(!isBoardExpanded)}
                  className="p-2 rounded-xl text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all cursor-pointer"
                  title={isBoardExpanded ? "Collapse whiteboard" : "Expand whiteboard"}
                >
                  {isBoardExpanded ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Flexible Quick-Add Box (Expands smoothly to fit whatever is entered) */}
          <div className="mt-4">
            <motion.div 
              layout
              className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-850/60 p-3 sm:p-3.5 shadow-xs focus-within:border-zinc-300 dark:focus-within:border-zinc-700 transition-all"
            >
              <textarea
                ref={inputRef}
                value={newContent}
                maxLength={MAX_NOTE_LENGTH}
                onChange={(e) => {
                  setNewContent(e.target.value);
                  if (!isInputExpanded) setIsInputExpanded(true);
                }}
                onFocus={() => setIsInputExpanded(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey || (!e.shiftKey && !isInputExpanded))) {
                    e.preventDefault();
                    onInitiateAddNote();
                  }
                }}
                placeholder="Write a temporary note, message or checklist..."
                className="w-full bg-transparent resize-none outline-none font-medium text-sm placeholder-zinc-400 dark:placeholder-zinc-500 text-zinc-900 dark:text-zinc-100 transition-all"
                style={{ minHeight: isInputExpanded ? '56px' : '36px' }}
              />

              {/* Expandable Action Toolbar */}
              <AnimatePresence>
                {(isInputExpanded || newContent.trim().length > 0) && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.15 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-2 pt-2 border-t border-zinc-200/80 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-2">
                      {/* Quick Option Tags */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mr-0.5">
                          Quick:
                        </span>
                        {QUICK_OPTIONS.map((opt) => (
                          <button
                            key={opt.label}
                            type="button"
                            onClick={() => insertQuickOption(opt.prefix)}
                            className="px-2 py-1 rounded-lg bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-amber-50 dark:hover:bg-amber-950/40 hover:text-amber-900 dark:hover:text-amber-200 hover:border-amber-300 dark:hover:border-amber-700/60 text-[11px] font-semibold flex items-center gap-1 transition-all cursor-pointer border border-zinc-200/80 dark:border-zinc-700/60 shadow-2xs active:scale-95"
                            title={`Add ${opt.label} tag`}
                          >
                            <span>{opt.icon}</span>
                            <span>{opt.label}</span>
                          </button>
                        ))}
                      </div>

                      {/* Character Counter & Actions */}
                      <div className="flex items-center gap-2 ml-auto">
                        <span className={`text-[10px] font-mono font-bold ${
                          newContent.length >= MAX_NOTE_LENGTH ? 'text-rose-500 font-black' :
                          newContent.length >= 320 ? 'text-amber-500' : 'text-zinc-400 dark:text-zinc-500'
                        }`}>
                          {newContent.length}/{MAX_NOTE_LENGTH}
                        </span>

                        <button
                          type="button"
                          onClick={() => {
                            setNewContent('');
                            setIsInputExpanded(false);
                          }}
                          className="px-2.5 py-1.5 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 text-xs font-medium"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={onInitiateAddNote}
                          disabled={!newContent.trim() || isPosting}
                          className="px-3.5 py-1.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl font-bold text-xs flex items-center gap-1.5 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:hover:scale-100 transition-all shadow-xs cursor-pointer"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>Post</span>
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </div>

          {/* Flexible Sticky Notes Board (Expands to fit items) */}
          <AnimatePresence>
            {isBoardExpanded && notes.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="mt-5 pt-4 border-t border-zinc-100 dark:border-zinc-800/80"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  <AnimatePresence mode="popLayout">
                    {notes.map((note) => {
                      const isEditing = editingNoteId === note.id;

                      return (
                        <motion.div
                          key={note.id}
                          layout
                          initial={{ opacity: 0, scale: 0.85, y: 15 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.7, y: -15 }}
                          transition={{ duration: 0.2 }}
                          className="relative group rounded-2xl p-4 bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-xs hover:shadow-md hover:border-zinc-300 dark:hover:border-zinc-700 transition-all duration-200"
                        >
                          {/* Pushpin / Tape graphic accent */}
                          <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 flex items-center justify-center pointer-events-none">
                            {note.pinned ? (
                              <div className="w-5 h-5 rounded-full bg-rose-500 text-white flex items-center justify-center shadow-md border-2 border-white dark:border-zinc-900 ring-1 ring-rose-600/30">
                                <Pin className="w-2.5 h-2.5 fill-white" />
                              </div>
                            ) : (
                              <div className="w-5 h-5 rounded-full bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 flex items-center justify-center shadow-xs border border-white dark:border-zinc-800 ring-1 ring-zinc-400/20">
                                <Pin className="w-2.5 h-2.5" />
                              </div>
                            )}
                          </div>

                          {/* Note Header: Author & Actions */}
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-1.5 text-[11px] font-bold opacity-75">
                              {note.authorAvatar ? (
                                <img 
                                  src={note.authorAvatar} 
                                  alt={note.authorName} 
                                  className="w-4 h-4 rounded-full object-cover" 
                                />
                              ) : (
                                <span className="w-4 h-4 rounded-full bg-black/10 dark:bg-white/10 flex items-center justify-center text-[9px]">
                                  {note.authorName ? note.authorName.charAt(0).toUpperCase() : 'F'}
                                </span>
                              )}
                              <span>{getFirstName(note.authorName)}</span>
                              <span className="opacity-50">•</span>
                              <span className="text-[10px] font-normal opacity-60">
                                {formatNoteTime(note.createdAt)}
                              </span>
                            </div>

                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => handleTogglePin(note)}
                                className={`p-1 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 transition-colors ${
                                  note.pinned ? 'text-rose-600 font-bold' : 'text-zinc-500'
                                }`}
                                title={note.pinned ? 'Unpin' : 'Pin to top'}
                              >
                                <Pin className={`w-3.5 h-3.5 ${note.pinned ? 'fill-rose-600' : ''}`} />
                              </button>

                              <button
                                onClick={() => {
                                  setEditingNoteId(note.id);
                                  setEditContent(note.content);
                                }}
                                className="p-1 rounded-lg text-zinc-500 hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                                title="Edit note"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>

                              <button
                                onClick={() => handleDeleteNote(note.id)}
                                className="p-1 rounded-lg text-zinc-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                                title="Crumple / Remove"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Content or Edit Box */}
                          {isEditing ? (
                            <div className="space-y-2">
                              <textarea
                                ref={editInputRef}
                                value={editContent}
                                maxLength={MAX_NOTE_LENGTH}
                                onChange={(e) => setEditContent(e.target.value)}
                                className="w-full bg-white/70 dark:bg-black/30 p-2 rounded-xl text-xs sm:text-sm resize-none outline-none border border-black/10 dark:border-white/10 font-medium"
                                autoFocus
                              />
                              <div className="flex items-center justify-between gap-1.5">
                                <span className={`text-[10px] font-mono font-bold ${
                                  editContent.length >= MAX_NOTE_LENGTH ? 'text-rose-500 font-black' :
                                  editContent.length >= 320 ? 'text-amber-500' : 'text-zinc-400 dark:text-zinc-500'
                                }`}>
                                  {editContent.length}/{MAX_NOTE_LENGTH}
                                </span>

                                <div className="flex items-center gap-1.5">
                                  <button
                                    onClick={() => setEditingNoteId(null)}
                                    className="px-2 py-1 text-[11px] font-semibold text-zinc-500 hover:text-zinc-800"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    onClick={() => handleSaveEdit(note.id)}
                                    className="px-3 py-1 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg text-[11px] font-bold flex items-center gap-1 shadow-xs"
                                  >
                                    <Check className="w-3 h-3" />
                                    Save
                                  </button>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="text-xs sm:text-sm font-medium leading-relaxed break-words whitespace-pre-wrap">
                              {note.content.split('\n').map((line, lIdx) => {
                                const isCheckbox = line.startsWith('- [ ] ') || line.startsWith('- [x] ') || line.startsWith('- [X] ');
                                if (isCheckbox) {
                                  const isChecked = line.startsWith('- [x] ') || line.startsWith('- [X] ');
                                  const label = line.replace(/^- \[[ xX]\] /, '');
                                  return (
                                    <div 
                                      key={lIdx} 
                                      onClick={() => handleToggleCheckboxInContent(note, lIdx)}
                                      className="flex items-start gap-2 py-0.5 cursor-pointer select-none hover:opacity-80 transition-opacity"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={isChecked}
                                        onChange={() => {}}
                                        className="mt-0.5 rounded text-amber-600 focus:ring-amber-500 w-3.5 h-3.5 cursor-pointer pointer-events-none"
                                      />
                                      <span className={isChecked ? 'line-through opacity-50' : ''}>
                                        {label}
                                      </span>
                                    </div>
                                  );
                                }

                                return (
                                  <div key={lIdx} className="min-h-[1.25rem]">
                                    <ReactMarkdown
                                      components={{
                                        p: ({ node, ...props }) => <span {...props} />,
                                        strong: ({ node, ...props }) => <strong className="font-extrabold" {...props} />
                                      }}
                                    >
                                      {line}
                                    </ReactMarkdown>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Confirmation Modal for Wiping the Entire Board */}
      <ConfirmModal
        isOpen={showWipeConfirm}
        title="Wipe Whiteboard?"
        message="This will clear all notes currently on the whiteboard. Are you sure you want a clean slate?"
        confirmLabel="Wipe Clean"
        onConfirm={handleWipeBoard}
        onClose={() => setShowWipeConfirm(false)}
      />

      {/* Straightforward Yes/No Notification Prompt Modal */}
      <AnimatePresence>
        {showNotifyPrompt && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowNotifyPrompt(false)}
              className="absolute inset-0 bg-zinc-950/50 backdrop-blur-xs"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ duration: 0.2 }}
              className="relative w-full max-w-sm bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-2xl p-6 text-center space-y-4 overflow-hidden"
            >
              <button
                onClick={() => setShowNotifyPrompt(false)}
                className="absolute top-4 right-4 p-1.5 rounded-full text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="w-12 h-12 rounded-2xl bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto text-2xl shadow-inner">
                🔔
              </div>

              <div>
                <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                  Notify team members now?
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
                  Send an instant push notification to team members so they are aware of this note?
                </p>
              </div>

              {/* Note Preview Snippet */}
              <div className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/80 text-zinc-800 dark:text-zinc-200 text-xs font-medium text-left max-h-24 overflow-y-auto break-words">
                {pendingContent}
              </div>

              <div className="flex flex-col gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => handleConfirmAddNote(true)}
                  disabled={isPosting}
                  className="w-full py-3 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-bold text-xs rounded-xl shadow-xs hover:scale-[1.01] active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Yes, Send Notification</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleConfirmAddNote(false)}
                  disabled={isPosting}
                  className="w-full py-3 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-bold text-xs rounded-xl hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
                >
                  No, Don't Send (Post Only)
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </section>
  );
}
