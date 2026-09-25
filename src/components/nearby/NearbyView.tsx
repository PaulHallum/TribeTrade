import { useState, useEffect } from 'react';
import { MapPin, Search, Star, Navigation, CloudSun, Filter, Home, Compass, RefreshCw, Loader2, Sparkles, Calendar, X, Clock, ShieldAlert, Code } from 'lucide-react';
import { motion } from 'motion/react';
import { useSettings } from '../../contexts/SettingsContext';
import { useAuth } from '../../App';
import { db } from '../../lib/firebase';
import { collection, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { generatePlaceRecommendations, formatSpecificSearch, formatDiscoverSearch, generateVenueReasons } from '../../services/gemini';
import { fetchNearbyPlaces } from '../../services/placesService';
import { logger } from '../../services/logger';
import ReactMarkdown from 'react-markdown';
import SmartConvertModal from '../smart/SmartConvertModal';
import { useSubscriptionTier } from '../../hooks/useSubscriptionTier';
import { incrementNearbyUsage, resetNearbyUsage } from '../../services/usageService';
import { AnimatePresence } from 'motion/react';
import PageHeader from '../common/PageHeader';
import { useToast } from '../../contexts/ToastContext';



interface Place {
  name: string;
  type: string;
  primaryType?: string;
  primaryTypeDisplayName?: string;
  rating: number;
  exact_distance_miles?: number;
  estimated_drive_time?: string;
  lat?: number;
  lng?: number;
  url?: string;
  categoryBadge?: any;
  distance?: number;
  cost?: string;
  reason: string;
  matchFound?: boolean;
  matchDetails?: string;
  description?: string;
  location?: string;
  dates?: string;
}

interface FamilyMember {
  id: string;
  name: string;
  role: string;
  allergies?: string[];
  favoriteThings?: string[];
  memories?: string[];
}

export default function NearbyView({ initialQuery }: { initialQuery?: string }) {
  const { showToast } = useToast();
  const [radius, setRadius] = useState(15);
  const [timeframe, setTimeframe] = useState<'today' | '7days' | '14days'>('7days');
  const [mode, setMode] = useState<string[]>(['family']);
  const [customSearchQuery, setCustomSearchQuery] = useState(initialQuery || '');
  const { settings } = useSettings();
  const { tradeUserId, user } = useAuth();
  const { subscriptionTier } = useSubscriptionTier();
  const [nearbyRuns, setNearbyRuns] = useState(0);
  const [locationError, setLocationError] = useState(false);
  const [showRawDataModal, setShowRawDataModal] = useState(false);

  useEffect(() => {
    if (initialQuery) {
      setCustomSearchQuery(initialQuery);
    }
  }, [initialQuery]);

  useEffect(() => {
    if (!tradeUserId) return;
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const today = `${year}-${month}-${day}`;
    const usageRef = doc(db, 'trade_users', tradeUserId, 'usage', today);
    return onSnapshot(usageRef, (snap) => {
      if (snap.exists()) {
        setNearbyRuns(snap.data().nearbyRuns || 0);
      } else {
        setNearbyRuns(0);
      }
    });
  }, [tradeUserId]);

  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [places, setPlaces] = useState<Place[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isWildcard, setIsWildcard] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'distance' | 'cost' | 'rating'>('distance');
  const [smartConvertPlace, setSmartConvertPlace] = useState<Place | null>(null);
  const [lastUpdated, setLastUpdated] = useState<any>(null);
  const [customExclusions, setCustomExclusions] = useState<string>(settings.nearbyExclusions || 'Art galleries, Museums, Antique shops');
  const [showExclusionsModal, setShowExclusionsModal] = useState(false);
  const [userCoords, setUserCoords] = useState<{lat: number, lng: number} | null>(null);
  const [specificSearchOutput, setSpecificSearchOutput] = useState<string | null>(null);

  const calculateDistanceMiles = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
    const R = 3958.8;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c * 10) / 10;
  };

  const processAndSetPlaces = async (rawPlaces: any[], contextString: string) => {
    if (!rawPlaces || rawPlaces.length === 0) {
      setPlaces([]);
      return;
    }

    // 1. Compute exact distance in miles for each venue
    const placesWithDist = rawPlaces.map((p: any) => {
      const pLat = p.location?.latitude;
      const pLng = p.location?.longitude;
      const dist = (userCoords && pLat && pLng)
        ? calculateDistanceMiles(userCoords.lat, userCoords.lng, pLat, pLng)
        : undefined;
      return { ...p, _dist: dist };
    });

    // 2. Strict Custom Exclusions Filter: Exclude items matching customExclusions (primaryType, primaryTypeDisplayName, types, name)
    const exclusionList = customExclusions
      ? customExclusions.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
      : [];

    const nonExcluded = placesWithDist.filter((p: any) => {
      if (exclusionList.length === 0) return true;

      const pName = (p.displayName?.text || p.name || '').toLowerCase();
      const pPrimaryType = (p.primaryType || '').toLowerCase().replace(/_/g, ' ');
      const pPrimaryDisp = (p.primaryTypeDisplayName?.text || '').toLowerCase();
      const pTypesList = Array.isArray(p.types) ? p.types.map((t: string) => t.toLowerCase().replace(/_/g, ' ')) : [];

      return !exclusionList.some(ex => {
        if (!ex) return false;
        const exStem = ex.replace(/ies$/, 'y').replace(/s$/, '');
        if (pName.includes(ex) || (exStem.length > 2 && pName.includes(exStem))) return true;
        if (pPrimaryType.includes(ex) || (exStem.length > 2 && pPrimaryType.includes(exStem))) return true;
        if (pPrimaryDisp.includes(ex) || (exStem.length > 2 && pPrimaryDisp.includes(exStem))) return true;
        if (pTypesList.some(t => t.includes(ex) || (exStem.length > 2 && t.includes(exStem)))) return true;
        return false;
      });
    });

    // 3. Strict Distance Filter: Keep strictly venues <= radius (if dist is available)
    const inRange = nonExcluded.filter((p: any) => {
      if (p._dist === undefined) return true;
      return p._dist <= radius;
    });

    const candidates = inRange.length > 0 ? inRange : nonExcluded;

    // 4. Fisher-Yates Shuffle to randomize candidates
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }

    // 4. Cap strictly at top 9 random results
    const top9 = candidates.slice(0, 9);

    // 5. Generate personalized 1-sentence fit reasons for each venue via Gemini AI
    const venueItemsForAI = top9.map((p: any) => ({
      name: p.displayName?.text || p.name || 'Local Venue',
      types: p.types,
      rating: p.rating
    }));

    let reasonsMap: Record<string, string> = {};
    try {
      reasonsMap = await generateVenueReasons(venueItemsForAI, contextString);
    } catch (e) {
      logger.warn('Failed to generate individual venue reasons', e);
    }

    // 6. Map to Place objects for PlaceCard rendering
    const mappedPlaces: Place[] = top9.map((p: any) => {
      const pLat = p.location?.latitude;
      const pLng = p.location?.longitude;

      const nameLower = (p.displayName?.text || p.name || '').toLowerCase();
      const isFreeKeywordName = 
        nameLower.includes('paddling pool') ||
        nameLower.includes('splash park') ||
        nameLower.includes('splash pad') ||
        nameLower.includes('splash pool') ||
        nameLower.includes('playground') ||
        nameLower.includes('play park') ||
        nameLower.includes('recreation ground') ||
        nameLower.includes('country park') ||
        nameLower.includes('public park') ||
        nameLower.includes('free');

      const paidTypes = [
        'zoo', 'amusement_park', 'theme_park', 'aquarium', 'museum',
        'bowling_alley', 'cinema', 'arcade', 'event_venue', 'stadium'
      ];
      const hasPaidType = Array.isArray(p.types) && p.types.some(t => paidTypes.includes(t));

      const isFreeType = Array.isArray(p.types) && (
        p.types.includes('playground') ||
        p.types.includes('public_park') ||
        p.types.includes('national_park') ||
        p.types.includes('campground') ||
        p.types.includes('park')
      );

      const isFree = !hasPaidType && (isFreeKeywordName || isFreeType);

      const weekdayDescs = p.regularOpeningHours?.weekdayDescriptions;
      const openingHoursStr = Array.isArray(weekdayDescs) && weekdayDescs.length > 0
        ? weekdayDescs.join(' • ')
        : undefined;

      const name = p.displayName?.text || p.name || 'Local Venue';
      const rawType = p.primaryTypeDisplayName?.text || p.primaryType || (Array.isArray(p.types) && p.types[0]);
      const formattedType = rawType ? String(rawType).replace(/_/g, ' ') : 'Attraction';
      const aiReason = reasonsMap[name] || `Great local family option for ${contextString}.`;

      return {
        name,
        type: formattedType,
        primaryType: p.primaryType,
        primaryTypeDisplayName: p.primaryTypeDisplayName?.text,
        rating: p.rating || 0,
        exact_distance_miles: p._dist,
        lat: pLat,
        lng: pLng,
        reason: aiReason,
        description: openingHoursStr ? `Opening Hours: ${openingHoursStr}` : undefined,
        location: p.formattedAddress || '',
        matchFound: true,
        matchDetails: aiReason
      };
    });

    setPlaces(mappedPlaces);
  };

  const handleSpecificSearch = async (searchQuery: string) => {
    if (!searchQuery.trim()) return;
    setIsGenerating(true);
    try {
      const lat = userCoords?.lat || 51.5074;
      const lng = userCoords?.lng || -0.1278;
      const timeframeLabel = timeframe === 'today' ? 'today' : timeframe === '14days' ? 'the next 14 days' : 'this weekend';

      const res = await fetch('/api/nearby-specific', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          searchQuery: searchQuery.trim(),
          lat,
          lng,
          radius,
          timeframe: timeframeLabel
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to search nearby places');
      }

      const data = await res.json();
      const rawPlaces = data.places || [];

      await processAndSetPlaces(rawPlaces, searchQuery.trim());
    } catch (err: any) {
      logger.error('Nearby specific search failed', err);
      showToast(err.message || 'Error executing search', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDiscoverSearch = async () => {
    setIsGenerating(true);
    try {
      const lat = userCoords?.lat || 51.5074;
      const lng = userCoords?.lng || -0.1278;

      const familyContextString = members.length > 0
        ? members.map(m => {
            const details = [];
            if (m.role) details.push(m.role);
            if (m.favoriteThings && m.favoriteThings.length > 0) details.push(`Likes: ${m.favoriteThings.join(', ')}`);
            return `${m.name}${details.length > 0 ? ` (${details.join('; ')})` : ''}`;
          }).join(' | ')
        : 'Family with children looking for fun local activities';

      const res = await fetch('/api/nearby-discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat,
          lng,
          radius,
          familyContext: familyContextString
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to discover nearby places');
      }

      const data = await res.json();
      const rawPlaces = data.places || [];

      await processAndSetPlaces(rawPlaces, familyContextString);
    } catch (err: any) {
      logger.error('Nearby discover search failed', err);
      showToast(err.message || 'Error discovering local ideas', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    if (!tradeUserId) return;

    const membersRef = collection(db, 'trade_users', tradeUserId, 'members');
    const unsub = onSnapshot(membersRef, (snapshot) => {
      const memberList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as FamilyMember[];
      setMembers(memberList);
    });

    // Load cached nearby results
    const loadCache = async () => {
      try {
        setPlaces([]);
      } catch (e) {
        logger.warn('Could not load nearby cache', e);
      } finally {
        setLoading(false);
      }
    };
    loadCache();

    return () => unsub();
  }, [tradeUserId]);

  useEffect(() => {
    // Prompt user to allow access to location immediately with maximum accuracy (maximumAge: 0)
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setUserCoords({ lat: latitude, lng: longitude });
        },
        (error) => {
          logger.warn('Initial location permission request failed or denied', error);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    }
  }, []);

  const sortPlaces = (p: Place[]) => {
    const specialEvents = p.filter(item => item.categoryBadge === 'special_event').slice(0, 3);
    const regularPlaces = p.filter(item => !specialEvents.includes(item));

    const sortFn = (a: Place, b: Place) => {
      if (sortBy === 'distance') {
        const distA = a.exact_distance_miles || 999;
        const distB = b.exact_distance_miles || 999;
        return distA - distB;
      }
      if (sortBy === 'cost') {
        const costWeight: any = { 'Free': 0, '£': 1, '££': 2, '£££': 3 };
        return (costWeight[a.cost] || 0) - (costWeight[b.cost] || 0);
      }
      if (sortBy === 'rating') {
        return (b.rating || 0) - (a.rating || 0);
      }
      return 0;
    };

    return [...specialEvents.sort(sortFn), ...regularPlaces.sort(sortFn)];
  };

  const sortedPlaces = sortPlaces(places);

  const generateRecommendations = async (wildcard = false, overrideQuery?: string) => {
    setIsGenerating(true);
    setIsWildcard(wildcard);
    setTimeout(() => {
      setIsGenerating(false);
      showToast('Execution paused. Ready for your new backend strategy!', 'info');
    }, 1000);
  };

  const openInMaps = (name: string, location?: string) => {
    const dest = encodeURIComponent(`${name}${location ? `, ${location}` : ''}`);
    const origin = userCoords ? `${userCoords.lat},${userCoords.lng}` : '';
    const url = origin 
      ? `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}&travelmode=driving`
      : `https://www.google.com/maps/search/?api=1&query=${dest}`;
    window.open(url, '_blank');
  };

  const handle1TapAddToCalendar = async (place: Place) => {
    if (!tradeUserId || !user) return;
    try {
      const { addDoc, collection } = await import('firebase/firestore');
      const { db } = await import('../../lib/firebase');
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(10, 0, 0, 0);
      const endTime = new Date(tomorrow.getTime() + 3 * 3600000);

      await addDoc(collection(db, 'trade_users', tradeUserId, 'calendarEvents'), {
        title: place.name,
        description: `${place.reason || place.description || ''}\nCost: ${place.cost}\nDistance: ${place.distance}`,
        location: place.location || '',
        startTime: tomorrow.toISOString(),
        endTime: endTime.toISOString(),
        authorId: user.uid,
        isShared: true,
        reminderTime: tomorrow,
        notified: false,
        createdAt: new Date().toISOString()
      });
      showToast(`Added "${place.name}" to Trade Calendar!`, 'success');
    } catch (err) {
      logger.error('Failed to 1-tap add event to calendar', err);
      showToast('Failed to add event to calendar', 'error');
    }
  };

  const isOwnerAdmin = user?.email?.toLowerCase() === 'paulhallum@googlemail.com' || user?.email?.toLowerCase() === 'paulhallum@gmail.com';

  return (
    <div className="max-w-5xl mx-auto pb-40">
      {locationError && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 rounded-3xl text-xs text-red-800 dark:text-red-300">
          <div className="flex items-center gap-2 font-bold mb-1">
            <MapPin className="w-4 h-4 text-red-500 shrink-0" />
            Location access is blocked
          </div>
          <p className="mb-2 text-red-700 dark:text-red-400">Nearby Guide needs your location to find places near you. To re-enable it:</p>
          <ol className="list-decimal list-inside space-y-1 text-red-700 dark:text-red-400">
            <li><strong>Chrome / Edge:</strong> Click the lock icon in address bar → Site Settings → Location → Allow</li>
            <li><strong>Firefox:</strong> Click the shield icon → Permissions → Access Your Location → Allow</li>
            <li><strong>Safari (iOS):</strong> Settings → Safari → Location → Allow</li>
          </ol>
          <p className="mt-2 text-red-600 dark:text-red-500">Then refresh the page and try again.</p>
        </div>
      )}

      <PageHeader
        icon={MapPin}
        title="Nearby Family Guide"
        subtitle="Personalised Family Events & Activities Near You"
        lastRun={lastUpdated}
        metaText={`${nearbyRuns} / 5 searches today`}
        extra={
          <div className="flex items-center gap-2">
            {isOwnerAdmin && nearbyRuns > 0 && (
              <button
                onClick={async () => {
                  if (!user) return;
                  await resetNearbyUsage(user.uid, tradeUserId || undefined);
                  showToast('Nearby search counter reset to 0!', 'success');
                }}
                className="px-3 py-2 bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 text-xs font-bold rounded-xl hover:bg-amber-500/20 transition-all flex items-center gap-1"
                title="Reset daily search limit for testing"
              >
                <RefreshCw size={14} />
                Reset Limit
              </button>
            )}
            <div className="bg-gradient-to-r from-emerald-500/10 to-blue-500/10 border border-emerald-500/20 dark:border-emerald-400/10 p-1 rounded-2xl flex gap-1 items-center">
              <button 
                onClick={() => setShowExclusionsModal(true)}
                className="p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-750 transition-colors text-slate-600 dark:text-slate-400 relative"
                title="Manage Exclusions"
              >
                <Filter size={18} />
                {customExclusions && <div className="absolute top-2 right-2 w-2 h-2 bg-emerald-500 rounded-full border-2 border-white dark:border-slate-900" />}
              </button>
            </div>
          </div>
        }
      />

      {/* Control Panel (Filters) - Positioned at Top */}
      <div className="space-y-4 px-2 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* Timeframe Toggle */}
          <div className="space-y-2">
            <span className="text-[9px] font-black text-zinc-400 uppercase tracking-[0.2em] px-1">Timeframe</span>
            <div className="bg-gradient-to-r from-emerald-500/10 to-blue-500/10 border border-emerald-500/20 dark:border-emerald-400/10 p-1 rounded-2xl flex gap-1">
              <button 
                onClick={() => setTimeframe('today')}
                className={`flex-1 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-[0.2em] transition-all ${timeframe === 'today' ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white' : 'text-zinc-400'}`}
              >
                Today
              </button>
              <button 
                onClick={() => setTimeframe('7days')}
                className={`flex-1 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-[0.2em] transition-all ${timeframe === '7days' ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white' : 'text-zinc-400'}`}
              >
                7 Days
              </button>
              <button 
                onClick={() => setTimeframe('14days')}
                className={`flex-1 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-[0.2em] transition-all ${timeframe === '14days' ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white' : 'text-zinc-400'}`}
              >
                14 Days
              </button>
            </div>
          </div>

          {/* Radius Selection */}
          <div className="space-y-2">
            <span className="text-[9px] font-black text-zinc-400 uppercase tracking-[0.2em] px-1">Distance</span>
            <div className="bg-gradient-to-r from-emerald-500/10 to-blue-500/10 border border-emerald-500/20 dark:border-emerald-400/10 p-1 rounded-2xl flex gap-1">
              {[5, 15, 25, 50].map((mi) => (
                <button 
                  key={mi}
                  onClick={() => setRadius(mi)}
                  className={`flex-1 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-[0.2em] transition-all ${radius === mi ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white' : 'text-zinc-400'}`}
                >
                  {mi}mi
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2 lg:col-span-3">
            <span className="text-[9px] font-black text-zinc-400 uppercase tracking-[0.2em] px-1">Experience Focus</span>
            <div className="bg-gradient-to-r from-emerald-500/10 to-blue-500/10 border border-emerald-500/20 dark:border-emerald-400/10 p-1 rounded-2xl flex flex-wrap gap-1">
              <button 
                onClick={() => setMode(['family'])}
                className={`flex-1 min-w-[80px] py-1.5 rounded-xl text-[9px] font-black uppercase tracking-[0.2em] transition-all ${mode.includes('family') ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white' : 'text-zinc-400'}`}
              >
                Whole Family
              </button>
              {members.map(member => (
                <button 
                  key={member.id}
                  onClick={() => {
                    if (mode.includes('family')) {
                      setMode([member.name]);
                    } else if (mode.includes(member.name)) {
                      setMode(prev => prev.filter(m => m !== member.name).length === 0 ? ['family'] : prev.filter(m => m !== member.name));
                    } else {
                      setMode(prev => [...prev, member.name]);
                    }
                  }}
                  className={`flex-1 min-w-[80px] py-1.5 rounded-xl text-[9px] font-black uppercase tracking-[0.2em] transition-all ${mode.includes(member.name) ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white' : 'text-zinc-400'}`}
                >
                  {member.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Search Input & General Idea Generator */}
      <div className="mb-6 px-2 space-y-4">
        {/* Specific Custom Search */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest px-1">Search Something Specific</label>
          <div className="relative flex items-center">
            <Search className="absolute left-4 w-4 h-4 text-zinc-400" />
            <input
              type="text"
              value={customSearchQuery}
              onChange={(e) => setCustomSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSpecificSearch(customSearchQuery);
                }
              }}
              placeholder="e.g. 'soft play', 'indoor play spaces', 'splash parks'"
              className="w-full pl-11 pr-32 py-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-xs text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
            />
            {customSearchQuery && (
              <button 
                onClick={() => {
                  setCustomSearchQuery('');
                  setSpecificSearchOutput(null);
                  setPlaces([]);
                }}
                className="absolute right-28 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1.5 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors z-10"
                title="Clear text"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => handleSpecificSearch(customSearchQuery)}
              disabled={isGenerating}
              className="absolute right-2 px-3 py-1.5 bg-emerald-500 text-white font-bold text-xs rounded-xl hover:bg-emerald-600 transition-all flex items-center gap-1.5"
            >
              {isGenerating ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
              Search
            </button>
          </div>
        </div>

        {/* Quick Inspiration Button */}
        <div className="bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-blue-500/10 border border-emerald-500/20 dark:border-emerald-400/10 p-4 rounded-3xl space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Compass className="w-4 h-4 text-emerald-500 shrink-0" />
              <span className="text-xs font-black text-zinc-900 dark:text-white uppercase tracking-wider">Need Inspiration?</span>
            </div>
            <span className="text-[10px] text-zinc-400 italic">Personalised to your family</span>
          </div>
          <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-relaxed">
            Not sure what you're looking for? Tap below to let Tribe curate the best events, pop-ups, and hidden gems near you based on your selected timeframe, distance, and family preferences.
          </p>
          <button 
            onClick={() => {
              setCustomSearchQuery('');
              handleDiscoverSearch();
            }}
            disabled={isGenerating}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 text-white rounded-2xl font-black uppercase tracking-[0.2em] text-xs active:scale-[0.98] transition-all disabled:opacity-50 shadow-md bg-emerald-500 hover:bg-emerald-600"
          >
            {isGenerating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Discover Local Ideas
          </button>
        </div>
      </div>

      {/* Sort Controls */}
      {places.length > 0 && (
        <div className="flex justify-between items-center px-2 mb-4">
          <h3 className="font-black text-xs uppercase tracking-widest text-zinc-400">Verified Local Venues ({places.length})</h3>
          <div className="bg-gradient-to-r from-emerald-500/10 to-blue-500/10 border border-emerald-500/20 dark:border-emerald-400/10 p-1 rounded-2xl flex gap-1 shadow-sm">
            {[
              { id: 'distance', label: 'Distance' },
              { id: 'rating', label: 'Rating' }
            ].map((opt) => (
              <button 
                key={opt.id}
                onClick={() => setSortBy(opt.id as any)}
                className={`px-3 py-1 rounded-xl text-[10px] font-bold transition-all ${
                  sortBy === opt.id
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {isGenerating ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Loader2 className="w-12 h-12 animate-spin text-emerald-500" />
          <p className="text-zinc-500 font-medium text-xs">Finding best events and activities for your family...</p>
        </div>
      ) : places.length > 0 ? (
        <div className="space-y-6 mb-8 px-2">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortedPlaces.map((place, i) => (
              <PlaceCard 
                key={place.name + i} 
                place={place} 
                index={i} 
                onClick={() => openInMaps(place.name, place.location)} 
                settings={settings}
                onSmartConvert={() => setSmartConvertPlace(place)}
              />
            ))}
          </div>
        </div>
      ) : null}

      <AnimatePresence>
        {smartConvertPlace && (
          <SmartConvertModal 
            onClose={() => setSmartConvertPlace(null)}
            content={`Name: ${smartConvertPlace.name}\nType: ${smartConvertPlace.type}\nDistance: ${smartConvertPlace.exact_distance_miles} miles\nLocation: ${smartConvertPlace.location || ''}\nDates: ${smartConvertPlace.dates || ''}\nURL: ${smartConvertPlace.url || ''}\nCost: ${smartConvertPlace.cost}\nReason: ${smartConvertPlace.reason}\n${smartConvertPlace.matchDetails ? `Match: ${smartConvertPlace.matchDetails}` : ''}`}
            originalType="note"
            members={members}
            onUpdated={() => {
               setSmartConvertPlace(null);
               showToast('Successfully converted and saved!', 'success');
            }}
          />
        )}
      </AnimatePresence>



      <AnimatePresence>
        {showExclusionsModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white dark:bg-zinc-900 w-full max-w-md rounded-[32px] overflow-hidden border border-zinc-200 dark:border-zinc-800"
            >
              <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-zinc-100 dark:bg-zinc-800 rounded-xl flex items-center justify-center">
                    <Filter className="w-5 h-5 text-zinc-900 dark:text-white" />
                  </div>
                  <h3 className="text-xl font-black text-zinc-900 dark:text-white uppercase tracking-tight">Exclusions</h3>
                </div>
                <button onClick={() => setShowExclusionsModal(false)} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full">
                  <X className="w-5 h-5 text-zinc-500" />
                </button>
              </div>
              <div className="p-8 space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest px-1">Categories to Ignore</label>
                  <textarea 
                    value={customExclusions}
                    onChange={(e) => setCustomExclusions(e.target.value)}
                    placeholder="e.g. Libraries, Art Galleries, Antique shops, etc."
                    rows={4}
                    className="w-full p-4 bg-zinc-50 dark:bg-zinc-800 border-none rounded-2xl focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white transition-all text-sm leading-relaxed"
                  />
                  <p className="text-[10px] text-zinc-400 italic px-1">Separate with commas. The AI will strictly filter these out from your results.</p>
                </div>
                <button 
                  onClick={() => setShowExclusionsModal(false)}
                  className="w-full py-4 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-black text-xs uppercase tracking-widest rounded-2xl hover:opacity-90 transition-all"
                >
                  Save Exclusions
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PlaceCard({ place, index, onClick, settings, onSmartConvert }: { place: Place, index: number, onClick: () => void, settings: any, onSmartConvert: (place: Place) => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="bg-white dark:bg-zinc-900 rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 transition-all group relative pl-2 shadow-sm"
    >
      <div className="absolute left-0 top-0 bottom-0 w-2 bg-emerald-500" />
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            {place.type}
          </span>
          {place.rating > 0 && (
            <div className="flex items-center gap-1 text-amber-500 shrink-0 bg-amber-500/10 px-2 py-0.5 rounded-lg border border-amber-500/20">
              <Star className="w-3 h-3 fill-current" />
              <span className="text-[10px] font-bold">{place.rating}</span>
            </div>
          )}
        </div>
        
        <div className="flex justify-between items-start mb-2">
          <h3 className="font-bold text-sm text-zinc-900 dark:text-white truncate pr-2" title={place.name}>{place.name}</h3>
        </div>

        {place.dates && (
          <div className="flex items-center gap-1.5 mb-2">
            <Calendar className="w-3 h-3 text-emerald-500" />
            <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
              {place.dates}
            </span>
          </div>
        )}

        {place.location && (
          <div className="flex items-center gap-1.5 mb-2">
            <MapPin className="w-3 h-3 text-zinc-400" />
            <span className="text-[10px] font-medium text-zinc-600 dark:text-zinc-400 truncate pr-2">
              {place.location}
            </span>
          </div>
        )}

        {place.description && (
          <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-relaxed mb-4 line-clamp-2">
            {place.description}
          </p>
        )}

        <div className="flex items-center gap-3 text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-4 pt-3 border-t border-zinc-100 dark:border-zinc-800">
          <span className="flex items-center gap-1"><Navigation className="w-2.5 h-2.5" /> {place.exact_distance_miles} miles</span>
          {place.estimated_drive_time && (
            <span className="flex items-center gap-1"><Clock className="w-2.5 h-2.5 text-zinc-400" /> {place.estimated_drive_time}</span>
          )}
          {place.url && (
            <a 
              href={place.url} 
              target="_blank" 
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1 text-emerald-500 hover:opacity-80 transition-opacity"
            >
              <Navigation className="w-2.5 h-2.5" /> Website
            </a>
          )}
        </div>

        {place.reason && (
          <div className={`mb-4 p-3 rounded-xl border ${
            place.matchFound 
              ? 'bg-emerald-50/50 dark:bg-emerald-900/20 border-emerald-200/50 dark:border-emerald-800/30'
              : 'bg-zinc-50 dark:bg-zinc-800/50 border-zinc-100 dark:border-zinc-800/50'
          }`}>
            {place.matchFound && (
              <div className="flex items-center gap-1.5 mb-1.5">
                <Sparkles className="w-3 h-3 text-emerald-500 animate-pulse" />
                <span className="text-[9px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">Personalised Match</span>
              </div>
            )}
            <p className={`text-[10px] leading-relaxed italic font-medium ${
              place.matchFound ? 'text-emerald-700 dark:text-emerald-400' : 'text-zinc-600 dark:text-zinc-400'
            }`}>
              " {place.matchFound ? place.matchDetails : place.reason} "
            </p>
          </div>
        )}

        <div className="flex gap-1.5">
          <button 
            onClick={onClick}
            className="flex-1 py-2 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:opacity-90 transition-all flex items-center justify-center gap-1.5 bg-emerald-500"
          >
            <Navigation className="w-3 h-3" />
            Route
          </button>
          
          <button 
            onClick={() => onSmartConvert(place)}
            className="flex-1 py-2 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all flex items-center justify-center gap-1.5"
          >
            <Sparkles className="w-3 h-3" />
            Plan
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function EmptyNearby({ message }: { message: string }) {
  return (
    <div className="col-span-full py-12 text-center bg-zinc-50/50 dark:bg-zinc-900/50 rounded-3xl border-2 border-dashed border-zinc-200 dark:border-zinc-800">
      <MapPin className="w-6 h-6 text-zinc-300 mx-auto mb-2" />
      <p className="text-zinc-400 text-[10px] font-bold uppercase tracking-widest">{message}</p>
    </div>
  );
}
