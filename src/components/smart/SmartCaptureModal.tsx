import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  Camera, 
  Upload, 
  Mail, 
  Loader2, 
  Check, 
  AlertCircle,
  FileText,
  Calendar,
  CheckSquare,
  Sparkles,
  ChefHat,
  Clock
} from 'lucide-react';
import { useSettings } from '../../contexts/SettingsContext';
import { processSmartCapture, SmartConversionResult } from '../../services/smartCaptureService';
import { db } from '../../lib/firebase';
import { collection, addDoc, updateDoc, getCountFromServer, doc, getDoc } from 'firebase/firestore';
import { syncToGoogleCalendar } from '../../services/googleCalendar';
import { useAuth } from '../../App';
import { logger } from '../../services/logger';
import { useSubscriptionTier } from '../../hooks/useSubscriptionTier';
import { useToast } from '../../contexts/ToastContext';
import { downscaleAndCompressImage } from '../../utils/imageUtils';
import { parseAISODateToLocal } from '../../lib/dateUtils';

interface SmartCaptureModalProps {
  onClose: () => void;
  initialEmailText?: string;
  initialMode?: 'select' | 'camera' | 'file' | 'email' | 'document';
  members?: any[];
  onImageCaptured?: (base64: string, mimeType: string) => void;
  isBriefingContext?: boolean;
}

export default function SmartCaptureModal({ 
  onClose, 
  initialEmailText, 
  initialMode = 'select', 
  members = [],
  onImageCaptured,
  isBriefingContext = false
}: SmartCaptureModalProps) {
  const { user, tradeUserId, googleAccessToken, currentUserMemberId } = useAuth();
  const { settings } = useSettings();
  const { showToast } = useToast();
  const { subscriptionTier } = useSubscriptionTier();
  const [mode, setMode] = useState<'select' | 'camera' | 'email' | 'processing' | 'result' | 'file' | 'document'>(
    initialEmailText ? 'email' : (initialMode === 'file' || initialMode === 'document' ? 'select' : initialMode)
  );
  const [input, setInput] = useState<{ text?: string; imageBase64?: string; mimeType?: string }>({ text: initialEmailText });
  const [result, setResult] = useState<SmartConversionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isShared, setisShared] = useState(true);
  const [assignedTo, setAssignedTo] = useState(currentUserMemberId || 'all');
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialMode === 'camera') {
      startCamera();
    } else if (initialMode === 'file' || initialMode === 'document') {
      fileInputRef.current?.click();
    }
  }, [initialMode]);

  const startCamera = async () => {
    try {
      setMode('camera');
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      setStream(mediaStream);
    } catch (err) {
      logger.error('Camera access failed', err);
      setError('Could not access camera. Please check permissions.');
      setMode('select');
    }
  };

  useEffect(() => {
    if (mode === 'camera' && videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [mode, stream]);

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    } else if (videoRef.current && videoRef.current.srcObject) {
      const s = videoRef.current.srcObject as MediaStream;
      s.getTracks().forEach(track => track.stop());
    }
  };

  const capturePhoto = () => {
    if (videoRef.current) {
      const video = videoRef.current;
      let width = video.videoWidth;
      let height = video.videoHeight;

      // Forcefully downscale to a maximum resolution bounding box of 1024x1024 pixels
      const MAX_DIM = 1024;
      if (width > MAX_DIM || height > MAX_DIM) {
        if (width > height) {
          height = Math.round((height * MAX_DIM) / width);
          width = MAX_DIM;
        } else {
          width = Math.round((width * MAX_DIM) / height);
          height = MAX_DIM;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, width, height);
        // Export drawn canvas as highly compressed, lower-quality JPEG
        const base64 = canvas.toDataURL('image/jpeg', 0.6).split(',')[1];
        stopCamera();
        handleProcess({ imageBase64: base64, mimeType: 'image/jpeg' });
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const rawBase64 = (reader.result as string).split(',')[1];
        downscaleAndCompressImage(rawBase64, file.type)
          .then((compressedBase64) => {
            handleProcess({ imageBase64: compressedBase64, mimeType: 'image/jpeg' });
          })
          .catch((err) => {
            logger.error('Failed to downscale uploaded image', err);
            // fallback
            handleProcess({ imageBase64: rawBase64, mimeType: file.type });
          });
      };
      reader.readAsDataURL(file);
    }
  };

  useEffect(() => {
    if (initialEmailText) {
      handleProcess({ text: initialEmailText });
    }
  }, [initialEmailText]);

  const handleProcess = async (data: { text?: string; imageBase64?: string; mimeType?: string }) => {
    if (onImageCaptured && data.imageBase64) {
      onImageCaptured(data.imageBase64, data.mimeType || 'image/jpeg');
      onClose();
      return;
    }
    setMode('processing');
    setError(null);
    try {
      // PRIVACY: Images are processed in local memory and sent to the AI for analysis.
      // They are NEVER saved to Firestore, Storage, or any local cache.
      const res = await processSmartCapture(data, members, "English", isBriefingContext);
      setResult(res);
      setMode('result');
    } catch (err: any) {
      logger.error('Smart capture processing failed', err);
      if (err.message === 'LIMIT_EXCEEDED') {
         setError('Daily limit reached. Please wait or upgrade to Premium for more uses.');
      } else {
         setError('Tribe processing failed. Please try again.');
      }
      setMode('select');
    } finally {
      // Wreak and purge the component state holding the Base64 image data immediately
      setInput(prev => ({ ...prev, imageBase64: undefined, mimeType: undefined }));
    }
  };

  const handleRemoveAction = (index: number) => {
    if (!result || !result.actions) return;
    const updatedActions = result.actions.filter((_, i) => i !== index);
    setResult({ ...result, actions: updatedActions });
  };

  const handleSave = async () => {
    if (!result || !tradeUserId || !user) return;
    setSaving(true);
    try {
      for (const item of result.actions) {
        const collectionName = item.action === 'CREATE_CALENDAR_EVENT' ? 'calendarEvents' : 
                              item.action === 'CREATE_TASK' ? 'tasks' : 
                              item.action === 'CREATE_SHOPPING_ITEM' ? 'shoppingList' : 
                              item.action === 'CREATE_RECIPE' ? 'recipes' : 'notes';
        
        const dataToSave: any = {
          authorId: user.uid,
          isShared: isShared,
          assignedTo: assignedTo,
          createdAt: new Date().toISOString()
        };

        if (item.action === 'CREATE_TASK') {
          dataToSave.title = item.data.title;
          dataToSave.description = item.data.description || '';
          dataToSave.status = 'pending';
          if (item.data.dueDate) {
            const dueDate = parseAISODateToLocal(item.data.dueDate);
            const isDueDateValid = dueDate !== null && !isNaN(dueDate.getTime());
            dataToSave.dueDate = isDueDateValid ? dueDate : null;
            dataToSave.reminderTime = isDueDateValid ? dueDate : null;
            dataToSave.notified = false;
          }
        } else if (item.action === 'CREATE_CALENDAR_EVENT') {
          dataToSave.title = item.data.title;
          dataToSave.description = item.data.description || '';
          const startTime = item.data.startTime ? parseAISODateToLocal(item.data.startTime) : null;
          const isStartTimeValid = startTime !== null && !isNaN(startTime.getTime());
          
          let endTime = item.data.endTime ? parseAISODateToLocal(item.data.endTime) : null;
          if ((!endTime || isNaN(endTime.getTime())) && isStartTimeValid) {
            endTime = new Date(startTime.getTime() + 3600000);
          }

          dataToSave.startTime = isStartTimeValid ? startTime : null;
          dataToSave.endTime = endTime && !isNaN(endTime.getTime()) ? endTime : null;
          dataToSave.reminderTime = isStartTimeValid ? startTime : null;
          dataToSave.notified = false;
          if (item.data.location) dataToSave.location = item.data.location;

          // Auto-generate 7-day advance reminder task for birthdays/anniversaries if enabled
          const titleLower = dataToSave.title.toLowerCase();
          const isBirthdayOrAnniversary = titleLower.includes('birthday') || titleLower.includes('anniversary');
          if (isBirthdayOrAnniversary && isStartTimeValid) {
            const familyDoc = await getDoc(doc(db, 'trade_users', tradeUserId));
            const autoBirthday = familyDoc.exists() ? (familyDoc.data()?.autoBirthdayGiftReminders ?? true) : true;

            if (autoBirthday) {
              const sevenDaysBefore = new Date(startTime.getTime() - 7 * 24 * 60 * 60 * 1000);
              sevenDaysBefore.setHours(9, 0, 0, 0); // Always set to 09:00 AM daytime
              const now = new Date();
              let taskReminderTime = sevenDaysBefore;
              if (sevenDaysBefore < now) {
                const nextMorning = new Date(now);
                if (now.getHours() >= 9) {
                  nextMorning.setDate(nextMorning.getDate() + 1);
                }
                nextMorning.setHours(9, 0, 0, 0);
                taskReminderTime = nextMorning;
              }

              await addDoc(collection(db, 'trade_users', tradeUserId, 'tasks'), {
                title: `Buy card/presents for ${dataToSave.title}`,
                status: 'pending',
                authorId: user.uid,
                assignedTo: assignedTo,
                isShared: isShared,
                dueDate: taskReminderTime,
                reminderTime: taskReminderTime,
                notified: false,
                createdAt: new Date().toISOString()
              });
            }
          }
        } else if (item.action === 'CREATE_SHOPPING_ITEM') {
          dataToSave.name = item.data.name || item.data.title;
          dataToSave.category = item.data.category || 'Essentials';
          dataToSave.checked = false;
        } else if (item.action === 'CREATE_NOTE') {
          dataToSave.title = item.data.title || 'Extracted Note';
          dataToSave.content = item.data.content || item.data.description || 'No content';
        } else if (item.action === 'CREATE_RECIPE') {
          dataToSave.title = item.data.title;
          dataToSave.ingredients = item.data.ingredients || [];
          dataToSave.instructions = item.data.instructions || '';
          dataToSave.prepTime = item.data.prepTime || '';
          dataToSave.servings = item.data.servings || '';
          dataToSave.isFavorite = true;
        }



        const docRef = await addDoc(collection(db, 'trade_users', tradeUserId, collectionName), dataToSave);

        // Sync to Google Calendar if it's an event
        if (item.action === 'CREATE_CALENDAR_EVENT' && googleAccessToken && dataToSave.startTime) {
          try {
            const gEvent = await syncToGoogleCalendar(googleAccessToken, {
              title: dataToSave.title,
              description: dataToSave.description,
              startTime: dataToSave.startTime.toISOString(),
              endTime: dataToSave.endTime ? dataToSave.endTime.toISOString() : undefined,
              location: dataToSave.location || ''
            });
            if (gEvent && gEvent.id) {
              await updateDoc(docRef, { googleEventId: gEvent.id });
            }
          } catch (syncErr) {
            logger.error('Failed to sync Smart Capture event to Google Calendar', syncErr);
          }
        }
      }
      onClose();
    } catch (err) {
      logger.error('Smart capture items save failed', err);
      setError('Failed to save items.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={() => {
          stopCamera();
          onClose();
        }}
        className="absolute inset-0 bg-zinc-900/60 backdrop-blur-sm"
      />
      
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 40 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 40 }}
        className="relative w-full max-w-lg bg-white dark:bg-zinc-900 rounded-[28px] sm:rounded-[32px] overflow-hidden flex flex-col h-[85dvh] sm:h-auto sm:max-h-[90vh]"
      >
        <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <h3 className="text-xl font-bold text-zinc-900 dark:text-white">Smart Capture</h3>
            {subscriptionTier === 'free' && (
              <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200/50">
                Free Tier AI
              </span>
            )}
          </div>
          <button 
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors"
          >
            <X className="w-6 h-6 text-zinc-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-8">
          {mode === 'select' && (
            <div className="grid grid-cols-1 gap-3 sm:gap-4">
              <button 
                onClick={startCamera}
                className="flex items-center gap-3 sm:gap-4 p-4 sm:p-6 bg-zinc-50 dark:bg-zinc-800 rounded-2xl hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-all group"
              >
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-white dark:bg-zinc-700 flex items-center justify-center text-zinc-500 dark:text-zinc-400 group-hover:text-emerald-500 transition-colors shrink-0">
                  <Camera className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                <div className="text-left">
                  <p className="font-bold text-zinc-900 dark:text-white text-sm sm:text-base">Take Photo</p>
                  <p className="text-xs sm:text-sm text-zinc-500">Snap a picture of a flyer or note.</p>
                </div>
              </button>

              <button 
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-3 sm:gap-4 p-4 sm:p-6 bg-zinc-50 dark:bg-zinc-800 rounded-2xl hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-all group"
              >
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-white dark:bg-zinc-700 flex items-center justify-center text-zinc-500 dark:text-zinc-400 group-hover:text-emerald-500 transition-colors shrink-0">
                  <Upload className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                <div className="text-left">
                  <p className="font-bold text-zinc-900 dark:text-white text-sm sm:text-base">Upload File</p>
                  <p className="text-xs sm:text-sm text-zinc-500">Pick an image from your device.</p>
                </div>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  accept="image/*,application/pdf"
                  onChange={handleFileUpload}
                />
              </button>

              <button 
                onClick={() => setMode('email')}
                className="flex items-center gap-3 sm:gap-4 p-4 sm:p-6 bg-zinc-50 dark:bg-zinc-800 rounded-2xl hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-all group"
              >
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-white dark:bg-zinc-700 flex items-center justify-center text-zinc-500 dark:text-zinc-400 group-hover:text-emerald-500 transition-colors shrink-0">
                  <Mail className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                <div className="text-left">
                  <p className="font-bold text-zinc-900 dark:text-white text-sm sm:text-base">Convert Email</p>
                  <p className="text-xs sm:text-sm text-zinc-500">Paste email content to extract info.</p>
                </div>
              </button>
            </div>
          )}

          {mode === 'camera' && (
            <div className="space-y-6">
              <div className="relative aspect-[3/4] bg-black rounded-2xl overflow-hidden">
                <video 
                  ref={videoRef} 
                  autoPlay 
                  playsInline 
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex gap-4">
                <button 
                  onClick={capturePhoto}
                  className="flex-1 py-4 bg-emerald-600 text-white font-bold rounded-2xl hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2"
                >
                  <Camera className="w-5 h-5" />
                  Capture Photo
                </button>
                <button 
                  onClick={() => {
                    stopCamera();
                    setMode('select');
                  }}
                  className="px-6 py-4 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 font-bold rounded-2xl hover:bg-zinc-200 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {mode === 'email' && (
            <div className="space-y-6">
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-bold text-zinc-500 uppercase tracking-wider">Paste Email Content</label>
                  <span className={`text-xs font-bold ${ (input.text?.length || 0) > 4000 ? 'text-red-500 animate-pulse' : (input.text?.length || 0) > 3500 ? 'text-amber-500' : 'text-zinc-400' }`}>
                    {(input.text?.length || 0).toLocaleString()} / 4,000 characters
                  </span>
                </div>
                <textarea 
                  className="w-full h-48 p-4 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none resize-none text-zinc-900 dark:text-white"
                  placeholder="Paste the email text here..."
                  value={input.text || ''}
                  onChange={(e) => setInput({ text: e.target.value })}
                />
                {(input.text?.length || 0) > 4000 ? (
                  <div className="p-3 bg-red-50 dark:bg-red-950/20 text-red-650 dark:text-red-400 border border-red-150 dark:border-red-900/30 rounded-xl flex items-center gap-2 text-xs font-bold">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    Error: Text exceeds the 4,000 character limit. Please shorten your text before submitting.
                  </div>
                ) : (input.text?.length || 0) > 3500 ? (
                  <div className="p-3 bg-amber-50 dark:bg-amber-950/20 text-amber-655 dark:text-amber-400 border border-amber-150 dark:border-amber-900/30 rounded-xl flex items-center gap-2 text-xs font-bold">
                    <AlertCircle className="w-4 h-4 shrink-0 animate-bounce" />
                    Warning: Text is close to the 4,000 character limit. Please shorten it to avoid analysis errors.
                  </div>
                ) : null}
              </div>
              <div className="flex gap-4">
                <button 
                  onClick={() => handleProcess({ text: input.text })}
                  disabled={!input.text || input.text.length > 4000}
                  className="flex-1 py-4 bg-emerald-600 text-white font-bold rounded-2xl hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Analyze Email
                </button>
                <button 
                  onClick={() => setMode('select')}
                  className="px-6 py-4 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 font-bold rounded-2xl hover:bg-zinc-200 transition-colors"
                >
                  Back
                </button>
              </div>
            </div>
          )}

          {mode === 'processing' && (
            <div className="flex flex-col items-center justify-center py-12 gap-6">
              <div className="relative">
                <div className="w-20 h-20 border-4 border-emerald-100 dark:border-emerald-900/20 rounded-full" />
                <div className="absolute inset-0 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              </div>
              <div className="text-center">
                <h4 className="text-lg font-bold text-zinc-900 dark:text-white">Tribe is thinking...</h4>
                <p className="text-zinc-500">Extracting key information from your input.</p>
              </div>
            </div>
          )}

          {mode === 'result' && result && (
            <div className="space-y-6">
              <div className="p-6 bg-emerald-50 dark:bg-emerald-900/20 rounded-3xl border border-emerald-100 dark:border-emerald-500/20">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-white dark:bg-zinc-800 flex items-center justify-center text-emerald-600">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-zinc-900 dark:text-white">Extraction Complete</h4>
                    <p className="text-sm text-emerald-700 dark:text-emerald-400">
                      {result.summary}
                    </p>
                  </div>
                </div>
                
                <div className="space-y-4">
                  {result.actions.map((item, idx) => (
                    <div key={idx} className="relative flex flex-col gap-3 p-4 bg-white/50 dark:bg-zinc-800/50 rounded-2xl border border-white/20">
                      <button
                        onClick={() => handleRemoveAction(idx)}
                        className="absolute top-2 right-2 p-1 text-zinc-400 hover:text-red-500 rounded-md hover:bg-zinc-100/50 dark:hover:bg-zinc-850 transition-colors z-10"
                        title="Remove item"
                      >
                        <X className="w-4 h-4" />
                      </button>
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-700 flex items-center justify-center shrink-0">
                          {item.action === 'CREATE_TASK' && <CheckSquare className="w-4 h-4 text-orange-500" />}
                          {item.action === 'CREATE_CALENDAR_EVENT' && <Calendar className="w-4 h-4 text-blue-500" />}
                          {item.action === 'CREATE_SHOPPING_ITEM' && <CheckSquare className="w-4 h-4 text-emerald-500" />}
                          {item.action === 'CREATE_NOTE' && <FileText className="w-4 h-4 text-purple-500" />}
                          {item.action === 'CREATE_RECIPE' && <ChefHat className="w-4 h-4 text-rose-500" />}
                        </div>
                        <div className="min-w-0 flex-1 pr-7">
                          <input 
                            type="text"
                            value={item.data.title || item.data.name || ''}
                            onChange={(e) => {
                              const newResult = { ...result };
                              if (item.action === 'CREATE_SHOPPING_ITEM') newResult.actions[idx].data.name = e.target.value;
                              else newResult.actions[idx].data.title = e.target.value;
                              setResult(newResult);
                            }}
                            className="w-full bg-transparent border-none p-0 font-bold text-sm text-zinc-900 dark:text-white focus:ring-0"
                          />
                          <textarea 
                            value={item.data.description || item.data.content || ''}
                            onChange={(e) => {
                              const newResult = { ...result };
                              if (item.action === 'CREATE_NOTE') newResult.actions[idx].data.content = e.target.value;
                              else newResult.actions[idx].data.description = e.target.value;
                              setResult(newResult);
                            }}
                            placeholder="Add details..."
                            className="w-full bg-transparent border-none p-0 text-xs text-zinc-500 focus:ring-0 resize-none h-8"
                          />
                        </div>
                      </div>

                      {(item.action === 'CREATE_TASK' || item.action === 'CREATE_CALENDAR_EVENT') && (
                        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-700/50">
                          <div className="relative">
                            <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-400" />
                            <input 
                              type="date"
                              value={(() => {
                                const val = item.data.dueDate || item.data.startTime;
                                if (!val) return '';
                                try { return new Date(val).toISOString().split('T')[0]; } catch { return ''; }
                              })()}
                              onChange={(e) => {
                                const newResult = { ...result };
                                const current = new Date(item.data.dueDate || item.data.startTime || new Date());
                                const [y, m, d] = e.target.value.split('-').map(Number);
                                if (y && m && d) {
                                  current.setFullYear(y, m - 1, d);
                                  const iso = current.toISOString();
                                  if (item.action === 'CREATE_TASK') newResult.actions[idx].data.dueDate = iso;
                                  else newResult.actions[idx].data.startTime = iso;
                                  setResult(newResult);
                                }
                              }}
                              className="w-full bg-zinc-100/50 dark:bg-zinc-700/50 border-none rounded-lg py-1.5 pl-7 pr-2 text-[10px] font-bold text-zinc-600 dark:text-zinc-300 focus:ring-1 focus:ring-emerald-500"
                            />
                          </div>
                          <div className="relative">
                            <Clock className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-400" />
                            <input 
                              type="time"
                              value={(() => {
                                const val = item.data.dueDate || item.data.startTime;
                                if (!val) return '';
                                try { 
                                  const d = new Date(val);
                                  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
                                } catch { return ''; }
                              })()}
                              onChange={(e) => {
                                const newResult = { ...result };
                                const current = new Date(item.data.dueDate || item.data.startTime || new Date());
                                const [h, min] = e.target.value.split(':').map(Number);
                                current.setHours(h, min);
                                const iso = current.toISOString();
                                if (item.action === 'CREATE_TASK') newResult.actions[idx].data.dueDate = iso;
                                else newResult.actions[idx].data.startTime = iso;
                                setResult(newResult);
                              }}
                              className="w-full bg-zinc-100/50 dark:bg-zinc-700/50 border-none rounded-lg py-1.5 pl-7 pr-2 text-[10px] font-bold text-zinc-600 dark:text-zinc-300 focus:ring-1 focus:ring-emerald-500"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-4">
                <button 
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 py-4 text-white font-bold rounded-2xl transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  style={{ backgroundColor: settings.themeColor }}
                >
                  {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
                  Save Capture
                </button>
                <button 
                  onClick={() => setMode('select')}
                  disabled={saving}
                  className="px-6 py-4 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 font-bold rounded-2xl hover:bg-zinc-200 transition-colors disabled:opacity-50"
                >
                  Discard
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-6 p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl flex items-center gap-3">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <p className="text-sm font-medium">{error}</p>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
