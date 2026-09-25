import React, { useState } from 'react';
import { X, Trash2, CheckSquare, Sparkles, Share, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { generateSupportTicketFix } from '../../services/gemini';
import { useToast } from '../../contexts/ToastContext';

interface SupportTicketModalProps {
  task: any;
  onClose: () => void;
  onSave: (data: any) => Promise<void>;
  onDelete?: () => Promise<void>;
}

export default function SupportTicketModal({ task, onClose, onSave, onDelete }: SupportTicketModalProps) {
  const [title, setTitle] = useState(task?.title || '');
  const [description, setDescription] = useState(task?.description || '');
  const [developerResponse, setDeveloperResponse] = useState(task?.developerResponse || '');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isEditingDescription, setIsEditingDescription] = useState(!task?.description);
  const { showToast } = useToast();

  const handleSave = async () => {
    await onSave({
      title,
      description,
      developerResponse,
      status: task.status // Don't lose existing status unless toggled
    });
  };

  const handleGenerateFix = async () => {
    try {
      setIsGenerating(true);
      const category = title.replace('Support: ', '');
      const fix = await generateSupportTicketFix(category, description);
      setDeveloperResponse(fix);
      showToast('Action plan created successfully', 'success');
    } catch (error) {
      console.error(error);
      showToast('Failed to generate fix. Please try again.', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleShare = async () => {
    if (!developerResponse) {
      showToast('Nothing to share yet', 'error');
      return;
    }
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Fix for ${task.title}`,
          text: developerResponse,
        });
        return;
      } catch (err) {
        console.error('Share failed', err);
      }
    }
    
    // Fallback
    try {
      await navigator.clipboard.writeText(developerResponse);
      showToast('Copied to clipboard', 'success');
    } catch (err) {
      console.error('Copy failed', err);
      showToast('Failed to copy', 'error');
    }
  };

  const toggleStatus = async () => {
    const newStatus = task.status === 'completed' ? 'pending' : 'completed';
    await onSave({
      status: newStatus,
      developerResponse
    });
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
        className="relative bg-white dark:bg-zinc-900 rounded-[32px] w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="p-4 sm:p-6 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={toggleStatus}
              className={`w-8 h-8 rounded-xl border-2 flex items-center justify-center transition-all ${
                task.status === 'completed'
                  ? 'bg-emerald-500 border-emerald-500 text-white'
                  : 'border-zinc-300 dark:border-zinc-700 hover:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
              }`}
            >
              {task.status === 'completed' && <CheckSquare className="w-5 h-5" />}
            </button>
            <h3 className="text-xl font-black text-zinc-900 dark:text-white uppercase tracking-tight">
              Support Ticket
            </h3>
          </div>
          <div className="flex items-center gap-2">
            {onDelete && (
              <button 
                onClick={onDelete}
                className="p-2.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-all"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            )}
            <button onClick={onClose} className="p-2.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors">
              <X className="w-6 h-6 text-zinc-400" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 sm:p-10 space-y-8 scrollbar-hide">
          <div className="space-y-4">
            <input 
              autoFocus
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Support Category/Title"
              className="w-full text-2xl font-black bg-transparent border-none text-zinc-900 dark:text-white placeholder-zinc-300 focus:ring-0 outline-none p-0"
            />
            {isEditingDescription ? (
              <textarea 
                autoFocus={!!task?.id}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={() => setIsEditingDescription(false)}
                placeholder="Describe the issue..."
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
                  <span className="text-zinc-300">Describe the issue...</span>
                )}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-[9px] font-black text-indigo-650 dark:text-indigo-400 uppercase tracking-widest">
                Developer Response / Resolution
              </label>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleGenerateFix}
                  disabled={isGenerating}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
                >
                  {isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  AI Diagnosis
                </button>
                <button
                  onClick={handleShare}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg text-xs font-bold transition-colors"
                >
                  <Share className="w-3.5 h-3.5" />
                  Share
                </button>
              </div>
            </div>
            <textarea
              value={developerResponse}
              onChange={(e) => setDeveloperResponse(e.target.value)}
              placeholder="Type a response or generate an AI fix..."
              rows={8}
              className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-sm font-medium text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 resize-y focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div className="p-4 sm:p-6 border-t border-zinc-100 dark:border-zinc-800 shrink-0">
          <button 
            onClick={handleSave}
            className="w-full py-4 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-black uppercase tracking-widest rounded-2xl hover:scale-[0.98] active:scale-95 transition-all shadow-xl shadow-zinc-900/20"
          >
            Save Ticket
          </button>
        </div>
      </motion.div>
    </div>
  );
}
