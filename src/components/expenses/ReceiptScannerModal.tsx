import { useState, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  Camera, 
  Upload, 
  X, 
  Loader2, 
  AlertCircle, 
  ShieldCheck, 
  Sparkles,
  RefreshCw
} from 'lucide-react';
import { extractReceiptData, ExtractedReceiptData } from '../../services/receiptService';
import { downscaleAndCompressImage } from '../../utils/imageUtils';
import { logger } from '../../services/logger';

interface ReceiptScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExtracted: (data: ExtractedReceiptData) => void;
}

export default function ReceiptScannerModal({
  isOpen,
  onClose,
  onExtracted
}: ReceiptScannerModalProps) {
  const [mode, setMode] = useState<'choice' | 'camera' | 'processing'>('choice');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      setMode('choice');
      setError(null);
    }
  }, [isOpen]);

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
  };

  const startCamera = async () => {
    setError(null);
    try {
      setMode('camera');
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      setStream(mediaStream);
    } catch (err) {
      logger.error('Failed to open camera for receipt scan', err);
      setError('Could not access camera. Please check device permissions or upload a photo.');
      setMode('choice');
    }
  };

  useEffect(() => {
    if (mode === 'camera' && videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [mode, stream]);

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
    const rawBase64 = dataUrl.split(',')[1];

    stopCamera();
    processImage(rawBase64, 'image/jpeg');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const rawBase64 = (reader.result as string).split(',')[1];
      try {
        const compressed = await downscaleAndCompressImage(rawBase64, file.type);
        processImage(compressed, 'image/jpeg');
      } catch (err) {
        logger.warn('Image downscaling failed, using raw upload', err);
        processImage(rawBase64, file.type);
      }
    };
    reader.readAsDataURL(file);
  };

  const processImage = async (base64: string, mimeType: string) => {
    setMode('processing');
    setError(null);

    try {
      const extracted = await extractReceiptData({ imageBase64: base64, mimeType });
      onExtracted(extracted);
      onClose();
    } catch (err: any) {
      logger.error('Receipt extraction failed', err);
      setError('Tribe could not clearly read this receipt. Please retry or enter figures manually.');
      setMode('choice');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={mode !== 'processing' ? onClose : undefined}
        className="absolute inset-0 bg-zinc-950/70 backdrop-blur-sm"
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="relative w-full max-w-lg bg-white dark:bg-zinc-900 rounded-[28px] overflow-hidden shadow-2xl border border-zinc-200 dark:border-zinc-800 flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-zinc-900 dark:text-white">Scan Trade Receipt</h3>
              <p className="text-xs text-zinc-500">Auto-extract vendor, date, VAT & totals</p>
            </div>
          </div>
          {mode !== 'processing' && (
            <button
              onClick={() => {
                stopCamera();
                onClose();
              }}
              className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors text-zinc-400"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Content Area */}
        <div className="p-4 sm:p-6 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/30 rounded-2xl flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-400">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Privacy & HMRC notice banner */}
          <div className="p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl border border-zinc-100 dark:border-zinc-800 flex items-start gap-2.5 text-xs text-zinc-600 dark:text-zinc-400">
            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <p className="text-[11px] leading-relaxed">
              <strong className="text-zinc-900 dark:text-zinc-200">Ephemeral Processing:</strong> Photos are analysed in memory and discarded instantly. Tribe does not store receipt images. Please keep your physical receipts safe for HMRC.
            </p>
          </div>

          {/* Mode: Choice */}
          {mode === 'choice' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={startCamera}
                className="flex flex-col items-center justify-center p-6 bg-zinc-50 dark:bg-zinc-800/80 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 border border-zinc-200 dark:border-zinc-700/60 rounded-2xl transition-all group active:scale-95"
              >
                <div className="w-12 h-12 rounded-2xl bg-white dark:bg-zinc-700 flex items-center justify-center text-zinc-700 dark:text-zinc-200 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors shadow-sm mb-3">
                  <Camera className="w-6 h-6" />
                </div>
                <span className="font-bold text-sm text-zinc-900 dark:text-white">Take Photo</span>
                <span className="text-[11px] text-zinc-500 mt-0.5">Snap receipt with phone camera</span>
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center justify-center p-6 bg-zinc-50 dark:bg-zinc-800/80 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 border border-zinc-200 dark:border-zinc-700/60 rounded-2xl transition-all group active:scale-95"
              >
                <div className="w-12 h-12 rounded-2xl bg-white dark:bg-zinc-700 flex items-center justify-center text-zinc-700 dark:text-zinc-200 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors shadow-sm mb-3">
                  <Upload className="w-6 h-6" />
                </div>
                <span className="font-bold text-sm text-zinc-900 dark:text-white">Upload from Gallery</span>
                <span className="text-[11px] text-zinc-500 mt-0.5">Pick existing photo or screenshot</span>
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
          )}

          {/* Mode: Camera Viewfinder */}
          {mode === 'camera' && (
            <div className="space-y-4">
              <div className="relative aspect-[3/4] max-h-[380px] w-full bg-black rounded-2xl overflow-hidden shadow-inner flex items-center justify-center">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                {/* Guide overlay */}
                <div className="absolute inset-4 border-2 border-dashed border-white/50 rounded-xl pointer-events-none flex items-center justify-center">
                  <span className="text-white/80 bg-black/40 px-3 py-1 rounded-full text-xs font-medium">
                    Align receipt within border
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => {
                    stopCamera();
                    setMode('choice');
                  }}
                  className="px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={capturePhoto}
                  className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold shadow-md transition-all active:scale-95 flex items-center justify-center gap-2"
                >
                  <Camera className="w-4 h-4" />
                  Capture & Scan
                </button>
              </div>
            </div>
          )}

          {/* Mode: Processing / Extraction */}
          {mode === 'processing' && (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-4">
              <div className="relative">
                <div className="w-16 h-16 rounded-full bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                  <Loader2 className="w-8 h-8 animate-spin" />
                </div>
                <Sparkles className="w-5 h-5 text-amber-500 absolute -top-1 -right-1 animate-bounce" />
              </div>
              <div>
                <h4 className="font-bold text-base text-zinc-900 dark:text-white">Reading Receipt with AI...</h4>
                <p className="text-xs text-zinc-500 max-w-xs mt-1">
                  Extracting merchant, VAT breakdown, items, and matching HMRC tax categories.
                </p>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
