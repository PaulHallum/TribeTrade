import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Lock, KeyRound } from 'lucide-react';
import { hashPin } from '../../utils/crypto';
import { useSettings } from '../../contexts/SettingsContext';
import { useToast } from '../../contexts/ToastContext';

interface PinSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  hideCloseButton?: boolean;
}

export default function PinSetupModal({ isOpen, onClose, hideCloseButton }: PinSetupModalProps) {
  const { updateSettings, settings } = useSettings();
  const { showToast } = useToast();
  
  const [step, setStep] = useState<'create' | 'confirm'>('create');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setStep('create');
      setPin('');
      setConfirmPin('');
      setError(false);
      setIsSaving(false);
    }
  }, [isOpen]);

  const handleKeyPress = (num: number) => {
    setError(false);
    
    if (step === 'create') {
      if (pin.length < 4) {
        const newPin = pin + num;
        setPin(newPin);
        if (newPin.length === 4) {
          setTimeout(() => setStep('confirm'), 300);
        }
      }
    } else {
      if (confirmPin.length < 4) {
        const newConfirmPin = confirmPin + num;
        setConfirmPin(newConfirmPin);
        
        if (newConfirmPin.length === 4) {
          if (newConfirmPin === pin) {
            handleSave(newConfirmPin);
          } else {
            setError(true);
            setTimeout(() => {
              setConfirmPin('');
              setError(false);
            }, 800);
          }
        }
      }
    }
  };

  const handleDelete = () => {
    if (step === 'create') {
      setPin(prev => prev.slice(0, -1));
    } else {
      setConfirmPin(prev => prev.slice(0, -1));
    }
  };

  const handleSave = async (finalPin: string) => {
    setIsSaving(true);
    try {
      const hashed = await hashPin(finalPin);
      await updateSettings({ pinLock: true, pinHash: hashed });
      showToast('PIN Lock enabled successfully', 'success');
      onClose();
    } catch (err) {
      showToast('Failed to save PIN', 'error');
      setIsSaving(false);
    }
  };

  const activeValue = step === 'create' ? pin : confirmPin;

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[99999] bg-zinc-950/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 100 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 100 }}
          className="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-[32px] p-8 shadow-xl"
        >
          <div className="flex justify-between items-center mb-6">
            <div className="w-10" />
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
              <KeyRound className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            {hideCloseButton ? (
              <div className="w-10 h-10" />
            ) : (
              <button
                onClick={onClose}
                className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <X className="w-5 h-5 text-zinc-500" />
              </button>
            )}
          </div>

          <div className="text-center space-y-2 mb-8">
            <h3 className="text-xl font-black text-zinc-900 dark:text-white uppercase tracking-tight">
              {step === 'create' ? 'Set App PIN' : 'Confirm PIN'}
            </h3>
            <p className="text-sm text-zinc-500 font-medium">
              {step === 'create' ? 'Enter a 4-digit PIN to lock your app' : 'Re-enter your PIN to confirm'}
            </p>
          </div>

          <div className="flex justify-center gap-4 mb-8">
            {[0, 1, 2, 3].map(i => (
              <div 
                key={i} 
                className="w-14 h-16 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center border-2 border-transparent transition-all"
                style={{
                  borderColor: error ? '#ef4444' : (activeValue.length > i ? settings.themeColor : 'transparent')
                }}
              >
                {activeValue.length > i && (
                  <div className="w-3 h-3 rounded-full bg-zinc-900 dark:bg-white" />
                )}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
              <button
                key={num}
                onClick={() => handleKeyPress(num)}
                disabled={isSaving}
                className="h-14 rounded-2xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-xl font-bold text-zinc-900 dark:text-white transition-colors active:scale-95"
              >
                {num}
              </button>
            ))}
            <div className="h-14" />
            <button
              onClick={() => handleKeyPress(0)}
              disabled={isSaving}
              className="h-14 rounded-2xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-xl font-bold text-zinc-900 dark:text-white transition-colors active:scale-95"
            >
              0
            </button>
            <button
              onClick={handleDelete}
              disabled={isSaving || activeValue.length === 0}
              className="h-14 rounded-2xl text-sm font-bold uppercase tracking-wider text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors active:scale-95 disabled:opacity-50"
            >
              Del
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
