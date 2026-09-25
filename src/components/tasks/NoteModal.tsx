import React, { useState } from 'react';
import { motion } from 'motion/react';
import { X, Trash2, StickyNote, Check, Sparkles, Share2 } from 'lucide-react';
import { useSettings } from '../../contexts/SettingsContext';
import SmartConvertModal from '../smart/SmartConvertModal';
import { AnimatePresence } from 'motion/react';
import { shareViaWebShare, shareToWhatsApp, formatNoteShareText } from '../../lib/shareUtils';

interface Note {
  id: string;
  title?: string;
  content: string;
  color: string;
  isShared: boolean;
  authorId: string;
  createdAt?: any;
}

interface NoteModalProps {
  note: Note | null;
  onClose: () => void;
  onSave: (data: Partial<Note>) => void;
  onDelete?: () => void;
  members?: any[];
}

export default function NoteModal({ note, onClose, onSave, onDelete, members = [] }: NoteModalProps) {
  const { settings } = useSettings();
  const [title, setTitle] = useState(note?.title || '');
  const [content, setContent] = useState(note?.content || '');
  const [color, setColor] = useState(note?.color || '#f4f4f5'); // Default to light zinc
  const [isShared, setisShared] = useState(note?.isShared ?? true);
  const [assignedTo, setAssignedTo] = useState<string>((note as any)?.assignedTo || 'all');
  const [showSmartConvert, setShowSmartConvert] = useState(false);

  const colors = [
    { value: '#f4f4f5', label: 'Default' },
    { value: '#fef3c7', label: 'Amber' },
    { value: '#dbeafe', label: 'Blue' },
    { value: '#d1fae5', label: 'Emerald' },
    { value: '#ffe4e6', label: 'Rose' },
    { value: '#ede9fe', label: 'Violet' }
  ];

  const handleSave = () => {
    if (!content.trim()) return;
    onSave({
      title: title.trim(),
      content: content.trim(),
      color,
      isShared,

    });
  };

  const handleShare = async () => {
    const text = formatNoteShareText(title, content);
    if (!text.trim()) return;

    const shared = await shareViaWebShare({
      title: title || 'Note Details',
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
        className="relative rounded-[40px] w-full max-w-lg  overflow-hidden flex flex-col max-h-[85vh] transition-colors duration-500"
        style={{ backgroundColor: color }}
      >
        <div className="p-4 sm:p-6 border-b border-black/5 flex items-center justify-between shrink-0">
          <h3 className="text-xl font-black text-zinc-900 uppercase tracking-tight">
            {note ? 'Edit Note' : 'New Note'}
          </h3>
          <div className="flex items-center gap-2">
            {note && (
              <button 
                onClick={() => setShowSmartConvert(true)}
                className="p-2.5 text-zinc-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-full transition-all"
                title="Smart Convert"
              >
                <Sparkles className="w-5 h-5" />
              </button>
            )}
            <button 
              onClick={handleShare}
              className="p-2.5 text-zinc-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-full transition-all"
              title="Share Note"
            >
              <Share2 className="w-5 h-5" />
            </button>
            {onDelete && (
              <button 
                onClick={onDelete} 
                className="p-2.5 text-zinc-500 hover:text-red-600 hover:bg-red-50 rounded-full transition-all"
                title="Delete Note"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            )}
            <button 
              onClick={onClose} 
              className="p-2.5 text-zinc-500 hover:bg-black/5 rounded-full transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        <AnimatePresence>
          {showSmartConvert && (
            <SmartConvertModal 
              onClose={() => setShowSmartConvert(false)}
              content={content}
              originalId={note?.id}
              originalType="note"
              members={members}
              onUpdated={(newTitle, newContent) => {
                setTitle(newTitle);
                setContent(newContent);
              }}
            />
          )}
        </AnimatePresence>

        <div className="flex-1 overflow-y-auto p-5 sm:p-10 space-y-6">
          <input 
            autoFocus
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title (Optional)"
            className="w-full text-2xl font-black bg-transparent border-none text-black placeholder-black/20 focus:ring-0 outline-none p-0"
          />
          <textarea 
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Start writing something brilliant..."
            rows={8}
            className="w-full bg-transparent border-none text-black leading-relaxed placeholder-black/20 focus:ring-0 outline-none p-0 resize-none font-medium"
          />
        </div>

        <div className="p-5 sm:p-8 border-t border-black/5 space-y-6 bg-black/5 shrink-0">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-[9px] font-black text-black/50 uppercase tracking-[0.2em]">Note Color</label>
              <div className="flex gap-2">
                {colors.map((c) => (
                  <button
                    key={c.value}
                    onClick={() => setColor(c.value)}
                    className={`w-7 h-7 rounded-xl border border-black/10 transition-all hover:scale-110 flex items-center justify-center ${color === c.value ? 'ring-2 ring-black/20 ring-offset-2 ring-offset-zinc-50 dark:ring-offset-zinc-900 scale-110 ' : ''}`}
                    style={{ backgroundColor: c.value }}
                  >
                    {color === c.value && <Check className="w-3.5 h-3.5 text-black/40" />}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button 
            onClick={handleSave}
            className="w-full py-4 text-white font-black text-xs uppercase tracking-[0.3em] rounded-2xl hover:opacity-90 transition-all active:scale-[0.98]"
            style={{ backgroundColor: settings.themeColor }}
          >
            {note ? 'Save Changes' : 'Create Note'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
