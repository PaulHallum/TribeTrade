import { motion, AnimatePresence } from 'motion/react';
import { X, Trash2, AlertCircle, AlertTriangle } from 'lucide-react';

interface ConfirmModalProps {
 isOpen: boolean;
 title: string;
 message: string;
 confirmLabel?: string;
 cancelLabel?: string;
 variant?: 'danger' | 'warning' | 'info';
 onConfirm: () => void;
 onClose: () => void;
}

export default function ConfirmModal({ 
 isOpen, 
 title, 
 message, 
 confirmLabel = 'Confirm', 
 cancelLabel = 'Cancel',
 variant = 'danger',
 onConfirm, 
 onClose 
}: ConfirmModalProps) {
 
 const getVariantStyles = () => {
 switch (variant) {
 case 'danger':
 return {
 icon: Trash2,
 iconBg: 'bg-red-100 dark:bg-red-900/30',
 iconColor: 'text-red-600 dark:text-red-400',
 confirmBg: 'bg-red-500 hover:bg-red-600',
 buttonText: 'text-white'
 };
 case 'warning':
 return {
 icon: AlertTriangle,
 iconBg: 'bg-amber-100 dark:bg-amber-900/30',
 iconColor: 'text-amber-600 dark:text-amber-400',
 confirmBg: 'bg-amber-500 hover:bg-amber-600',
 buttonText: 'text-white'
 };
 default:
 return {
 icon: AlertCircle,
 iconBg: 'bg-emerald-100 dark:bg-emerald-900/30',
 iconColor: 'text-emerald-600 dark:text-emerald-400',
 confirmBg: 'bg-emerald-500 hover:bg-emerald-600',
 buttonText: 'text-white'
 };
 }
 };

 const styles = getVariantStyles();
 const Icon = styles.icon;

 return (
 <AnimatePresence>
 {isOpen && (
 <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
 <motion.div
 initial={{ opacity: 0 }}
 animate={{ opacity: 1 }}
 exit={{ opacity: 0 }}
 onClick={onClose}
 className="absolute inset-0 bg-zinc-950/40 backdrop-blur-sm"
 />
 <motion.div
 initial={{ opacity: 0, scale: 0.95, y: 20 }}
 animate={{ opacity: 1, scale: 1, y: 0 }}
 exit={{ opacity: 0, scale: 0.95, y: 20 }}
 className="relative w-full max-w-sm bg-white dark:bg-zinc-900 rounded-[32px] overflow-hidden"
 >
 <div className="p-8 text-center">
 <div className={`w-16 h-16 ${styles.iconBg} rounded-2xl flex items-center justify-center mx-auto mb-6`}>
 <Icon className={`w-8 h-8 ${styles.iconColor}`} />
 </div>
 
 <h3 className="text-xl font-bold text-zinc-900 dark:text-white mb-2">
 {title}
 </h3>
 <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed mb-8">
 {message}
 </p>

 <div className="flex flex-col gap-2">
 <button
 onClick={() => {
 onConfirm();
 onClose();
 }}
 className={`w-full py-4 ${styles.confirmBg} ${styles.buttonText} font-black text-xs uppercase tracking-[0.2em] rounded-2xl transition-all active:scale-95`}
 >
 {confirmLabel}
 </button>
 <button
 onClick={onClose}
 className="w-full py-4 bg-zinc-50 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 font-bold text-[10px] uppercase tracking-widest rounded-2xl hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
 >
 {cancelLabel}
 </button>
 </div>
 </div>
 
 <button 
 onClick={onClose}
 className="absolute top-4 right-4 p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors text-zinc-400"
 >
 <X className="w-5 h-5" />
 </button>
 </motion.div>
 </div>
 )}
 </AnimatePresence>
 );
}
