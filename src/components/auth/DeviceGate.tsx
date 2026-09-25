import React, { useState, useEffect } from 'react';
import { 
  Smartphone, 
  Tablet, 
  Laptop, 
  ShieldAlert, 
  RotateCw, 
  LogOut, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Clock,
  ArrowRight
} from 'lucide-react';
import { useAuth } from '../../App';
import { 
  verifyAndRegisterCurrentDevice, 
  swapDevice, 
  RegisteredDevice, 
  DeviceVerificationResult,
  MAX_DEVICES,
  MAX_MONTHLY_SWAPS
} from '../../services/deviceService';
import { auth } from '../../lib/firebase';
import { signOut } from 'firebase/auth';
import { useToast } from '../../contexts/ToastContext';

interface DeviceGateProps {
  children: React.ReactNode;
}

export default function DeviceGate({ children }: DeviceGateProps) {
  const { user, tradeUserId } = useAuth();
  const { showToast } = useToast();

  const [checking, setChecking] = useState(true);
  const [deviceResult, setDeviceResult] = useState<DeviceVerificationResult | null>(null);
  const [swappingId, setSwappingId] = useState<string | null>(null);

  const activeTradeUserId = tradeUserId || (user ? `trade_${user.uid}` : null);

  const checkDevice = async () => {
    if (!activeTradeUserId) {
      setChecking(false);
      return;
    }

    try {
      const result = await verifyAndRegisterCurrentDevice(activeTradeUserId);
      setDeviceResult(result);
    } catch (err) {
      console.error('Device verification error', err);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    if (!activeTradeUserId) {
      setChecking(false);
      return;
    }
    checkDevice();
  }, [activeTradeUserId]);

  const handleSwap = async (oldDeviceId: string, oldDeviceName: string) => {
    if (!activeTradeUserId) return;
    setSwappingId(oldDeviceId);

    try {
      const res = await swapDevice(activeTradeUserId, oldDeviceId);
      if (res.success) {
        showToast(`Replaced ${oldDeviceName} with this device`, 'success');
        // Re-verify
        await checkDevice();
      } else {
        showToast(res.error || 'Failed to replace device', 'error');
      }
    } catch (err: any) {
      showToast('Swap error: ' + err.message, 'error');
    } finally {
      setSwappingId(null);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      window.location.reload();
    } catch (err: any) {
      showToast('Sign out error: ' + err.message, 'error');
    }
  };

  // If no user or checking is running, don't block
  if (!user || checking) {
    if (checking) {
      return (
        <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#f1f3f5] dark:bg-[#141518] gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
          <p className="text-xs text-zinc-500">Checking device registration...</p>
        </div>
      );
    }
    return <>{children}</>;
  }

  // If device is allowed, render children
  if (deviceResult?.allowed) {
    return <>{children}</>;
  }

  // If NOT allowed (4/4 registered devices already in use), show Device Gate
  const registeredDevices = deviceResult?.registeredDevices || [];
  const swapsRemaining = deviceResult?.swapsRemaining ?? 0;
  const currentDevice = deviceResult?.currentDevice;

  const getDeviceIcon = (type: RegisteredDevice['type']) => {
    switch (type) {
      case 'mobile':
        return <Smartphone className="w-5 h-5 text-emerald-500" />;
      case 'tablet':
        return <Tablet className="w-5 h-5 text-blue-500" />;
      case 'desktop':
      default:
        return <Laptop className="w-5 h-5 text-zinc-500 dark:text-zinc-300" />;
    }
  };

  const formatLastActive = (iso: string) => {
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return 'Recently';
      return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    } catch {
      return 'Recently';
    }
  };

  return (
    <div className="min-h-screen w-full bg-zinc-950 text-white flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl max-w-xl w-full p-5 sm:p-8 shadow-2xl space-y-6 my-auto">
        {/* Header Alert */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500 mx-auto flex items-center justify-center shadow-lg">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white">
            Device Limit Reached ({registeredDevices.length}/{MAX_DEVICES})
          </h2>
          <p className="text-xs sm:text-sm text-zinc-400 max-w-md mx-auto leading-relaxed">
            Your TribeTrade account is currently active across the maximum {MAX_DEVICES} registered devices.
          </p>
        </div>

        {/* Current Device Banner */}
        <div className="p-3.5 bg-zinc-800/60 rounded-2xl border border-zinc-700/60 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-zinc-700/60 flex items-center justify-center">
              {currentDevice ? getDeviceIcon(currentDevice.type) : <Smartphone className="w-5 h-5" />}
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-amber-400 block">
                This Device (Not Registered)
              </span>
              <p className="text-xs font-bold text-white">
                {currentDevice?.name || 'Current Browser / Device'}
              </p>
            </div>
          </div>
        </div>

        {/* Swap Quota Indicator */}
        <div className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 ${
          swapsRemaining > 0 
            ? 'bg-emerald-950/30 border-emerald-800/40 text-emerald-300' 
            : 'bg-red-950/30 border-red-800/40 text-red-300'
        }`}>
          <div className="flex items-center gap-2.5">
            <Clock className="w-4 h-4 shrink-0" />
            <div className="text-xs">
              <span className="font-bold">Monthly Device Swaps: </span>
              <span>{swapsRemaining} of {MAX_MONTHLY_SWAPS} remaining this month</span>
            </div>
          </div>
          {deviceResult?.nextAvailableSwapDate && swapsRemaining === 0 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-900/60 border border-red-700">
              Next swap: {deviceResult.nextAvailableSwapDate}
            </span>
          )}
        </div>

        {/* Registered Devices List */}
        <div className="space-y-2.5">
          <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400 block">
            {swapsRemaining > 0 
              ? 'Select an old device to replace with this one:' 
              : 'Your current registered devices:'}
          </span>

          <div className="space-y-2">
            {registeredDevices.map(dev => (
              <div
                key={dev.id}
                className="p-3 bg-zinc-800/40 hover:bg-zinc-800/80 rounded-2xl border border-zinc-800 flex items-center justify-between gap-3 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-zinc-800 flex items-center justify-center shrink-0">
                    {getDeviceIcon(dev.type)}
                  </div>
                  <div className="min-w-0 truncate">
                    <p className="text-xs font-bold text-white truncate">{dev.name}</p>
                    <p className="text-[10px] text-zinc-500 truncate">
                      Last active: {formatLastActive(dev.lastActiveAt)}
                    </p>
                  </div>
                </div>

                {swapsRemaining > 0 ? (
                  <button
                    onClick={() => handleSwap(dev.id, dev.name)}
                    disabled={Boolean(swappingId)}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-all shadow-sm shrink-0 active:scale-95"
                  >
                    {swappingId === dev.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <RotateCw className="w-3.5 h-3.5" />
                    )}
                    <span>Replace</span>
                  </button>
                ) : (
                  <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider shrink-0">
                    Active
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Fail-safe explanation if 0 swaps remaining */}
        {swapsRemaining === 0 && (
          <div className="p-3 bg-zinc-800/30 rounded-2xl border border-zinc-800 text-center space-y-1">
            <p className="text-xs text-zinc-400">
              To prevent account misuse, devices can only be changed twice a month. Please log in on one of your 4 registered devices above, or wait until your next replacement date.
            </p>
          </div>
        )}

        {/* Footer Actions */}
        <div className="pt-2 flex items-center justify-between border-t border-zinc-800">
          <button
            onClick={checkDevice}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-all"
          >
            <RotateCw className="w-3.5 h-3.5" />
            <span>Recheck</span>
          </button>

          <button
            onClick={handleSignOut}
            className="px-4 py-2 hover:bg-red-950/30 text-zinc-400 hover:text-red-400 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-all"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  );
}
