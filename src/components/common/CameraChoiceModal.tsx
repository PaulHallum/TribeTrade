import { motion, AnimatePresence } from 'motion/react';
import { Camera, Upload, FileText, X, ReceiptPoundSterling } from 'lucide-react';

interface CameraChoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onChoice: (choice: 'camera' | 'file' | 'document' | 'receipt') => void;
  title?: string;
}

export default function CameraChoiceModal({ isOpen, onClose, onChoice, title = "Capture Option" }: CameraChoiceModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-zinc-900/60 backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-sm bg-white dark:bg-zinc-900 rounded-[32px] overflow-hidden p-6"
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-zinc-900 dark:text-white px-2">{title}</h3>
          <button onClick={onClose} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors">
            <X className="w-5 h-5 text-zinc-400" />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3">
          <button
            onClick={() => { onChoice('receipt'); onClose(); }}
            className="flex items-center gap-4 p-4 bg-zinc-50 dark:bg-zinc-800 rounded-2xl hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-all group border border-transparent hover:border-emerald-100 dark:hover:border-emerald-800/30"
          >
            <div className="w-12 h-12 rounded-xl bg-white dark:bg-zinc-700 flex items-center justify-center text-zinc-500 dark:text-zinc-400 group-hover:text-emerald-500 transition-colors">
              <ReceiptPoundSterling className="w-6 h-6" />
            </div>
            <div className="text-left">
              <p className="font-bold text-zinc-900 dark:text-white">Scan Trade Receipt</p>
              <p className="text-xs text-zinc-500">Auto-record expense & VAT for MTD</p>
            </div>
          </button>

          <button
            onClick={() => { onChoice('camera'); onClose(); }}
            className="flex items-center gap-4 p-4 bg-zinc-50 dark:bg-zinc-800 rounded-2xl hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-all group border border-transparent hover:border-emerald-100 dark:hover:border-emerald-800/30"
          >
            <div className="w-12 h-12 rounded-xl bg-white dark:bg-zinc-700 flex items-center justify-center text-zinc-500 dark:text-zinc-400 group-hover:text-emerald-500 transition-colors ">
              <Camera className="w-6 h-6" />
            </div>
            <div className="text-left">
              <p className="font-bold text-zinc-900 dark:text-white">Take Photo</p>
              <p className="text-xs text-zinc-500">Snap a fresh picture</p>
            </div>
          </button>

          <button
            onClick={() => { onChoice('file'); onClose(); }}
            className="flex items-center gap-4 p-4 bg-zinc-50 dark:bg-zinc-800 rounded-2xl hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-all group border border-transparent hover:border-violet-100 dark:hover:border-violet-800/30"
          >
            <div className="w-12 h-12 rounded-xl bg-white dark:bg-zinc-700 flex items-center justify-center text-zinc-500 dark:text-zinc-400 group-hover:text-violet-500 transition-colors ">
              <Upload className="w-6 h-6" />
            </div>
            <div className="text-left">
              <p className="font-bold text-zinc-900 dark:text-white">Upload from Gallery</p>
              <p className="text-xs text-zinc-500">Pick an existing photo</p>
            </div>
          </button>

          <button
            onClick={() => { onChoice('document'); onClose(); }}
            className="flex items-center gap-4 p-4 bg-zinc-50 dark:bg-zinc-800 rounded-2xl hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all group border border-transparent hover:border-blue-100 dark:hover:border-blue-800/30"
          >
            <div className="w-12 h-12 rounded-xl bg-white dark:bg-zinc-700 flex items-center justify-center text-zinc-500 dark:text-zinc-400 group-hover:text-blue-500 transition-colors ">
              <FileText className="w-6 h-6" />
            </div>
            <div className="text-left">
              <p className="font-bold text-zinc-900 dark:text-white">Upload Document</p>
              <p className="text-xs text-zinc-500">Analyze PDF or documents</p>
            </div>
          </button>
        </div>
 </motion.div>
 </div>
 );
}
