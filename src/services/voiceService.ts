import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';
import { logger } from './logger';

const AUDIO_CACHE_NAME = 'tribe-audio-cache';
let currentAudio: HTMLAudioElement | null = null;

function getTextHash(text: any): string {
  const str = typeof text === 'string' ? text : String(text || '');
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return 'audio_' + Math.abs(hash).toString();
}

/**
 * Stop any active playback (both Google Cloud TTS and browser fallback SpeechSynthesis)
 */
export function stopSpeaking() {
  if (currentAudio) {
    try {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    } catch (e) {
      logger.warn('Failed to stop audio playback', e);
    }
    currentAudio = null;
  }

  if (window.speechSynthesis) {
    try {
      window.speechSynthesis.cancel();
    } catch (e) {
      logger.warn('Failed to cancel speech synthesis', e);
    }
  }
}

/**
 * Pre-warms SpeechSynthesis and triggers a background call to prime the Cloud Function container.
 */
export async function preWarmVoice(): Promise<void> {
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.getVoices();
  }
}

/**
 * Pre-fetches and caches neural audio in the background before playback is initiated.
 */
export async function preCacheAudio(text: string, voiceName: string = 'en-GB-Neural2-A'): Promise<void> {
  if (!text || !navigator.onLine) return;
  try {
    const textHash = getTextHash(text);
    const cache = await caches.open(AUDIO_CACHE_NAME);
    const cachedResponse = await cache.match(textHash);
    if (cachedResponse) {
      return;
    }

    try {
      const getTribeAudio = httpsCallable<{ text: string; voice?: string }, { audioContent: string }>(
        functions,
        'getTribeAudio'
      );
      const result = await getTribeAudio({ text, voice: voiceName });
      const audioContent = result.data?.audioContent;
      if (audioContent) {
        await cache.put(textHash, new Response(audioContent));
        logger.info('Pre-cached audio successfully for hash: ' + textHash);
      }
    } catch {
      // Cloud TTS service not provisioned or offline; client will smoothly use local SpeechSynthesis
    }
  } catch {
    // Non-critical cache access failure
  }
}

let prePrefetchedAudio: HTMLAudioElement | null = null;
let prePrefetchedUrl: string | null = null;

export function preCacheAudioUrl(url: string) {
  if (!url) return;
  if (prePrefetchedUrl === url && prePrefetchedAudio) return;
  try {
    const audio = new Audio(url);
    audio.preload = 'auto';
    audio.load();
    prePrefetchedAudio = audio;
    prePrefetchedUrl = url;
    logger.info('Pre-fetched audio URL successfully: ' + url);
  } catch (err) {
    logger.warn('Failed to pre-fetch audio URL', err);
  }
}

/**
 * Speaks the provided text using Google Cloud Text-to-Speech via Cloud Functions.
 * Falls back to native SpeechSynthesis if offline, if the API call fails, or on playback error.
 * 
 * @param text The text to speak.
 * @param voiceName The specific Neural2 voice to request (defaults to 'en-GB-Neural2-A').
 * @param onEnd Callback for when speaking completes.
 * @param onError Callback for when speaking fails.
 * @param tradeUserId Optional tradeUserId to use cached Cloud Function getTribeAudioCached
 * @param userId Optional userId to use cached Cloud Function getTribeAudioCached
 * @returns A promise that resolves when speech starts.
 */
export async function speakText(
  text: string,
  voiceName: string = 'en-GB-Neural2-A',
  onEnd?: () => void,
  onError?: (err: any) => void,
  tradeUserId?: string,
  userId?: string
): Promise<boolean> {
  // Always stop existing playback first
  stopSpeaking();

  if (!text) {
    if (onEnd) onEnd();
    return false;
  }

  // Use cached Cloud Function with Storage backing if tradeUserId and userId are provided
  if (tradeUserId && userId && navigator.onLine) {
    try {
      if (prePrefetchedAudio && prePrefetchedUrl) {
        currentAudio = prePrefetchedAudio;
        currentAudio.onended = () => {
          currentAudio = null;
          if (onEnd) onEnd();
        };
        currentAudio.onerror = (e) => {
          logger.error('Pre-fetched audio playback error', e);
          currentAudio = null;
          speakLocalFallback(text, onEnd, onError);
        };
        await currentAudio.play();
        return true;
      }

      // Fallback if not pre-fetched
      const getTribeAudioCached = httpsCallable<{ tradeUserId: string; userId: string; briefingText: string }, { audioUrl: string }>(
        functions,
        'getTribeAudioCached'
      );
      const result = await getTribeAudioCached({ tradeUserId, userId, briefingText: text });
      const audioUrl = result.data?.audioUrl;
      if (audioUrl) {
        const audio = new Audio(audioUrl);
        currentAudio = audio;
        audio.onended = () => {
          currentAudio = null;
          if (onEnd) onEnd();
        };
        audio.onerror = (e) => {
          logger.error('Remote audio playback error', e);
          currentAudio = null;
          speakLocalFallback(text, onEnd, onError);
        };
        await audio.play();
        return true;
      }
    } catch (err) {
      logger.error('Cached TTS failed, using client-side fallback', err);
      speakLocalFallback(text, onEnd, onError);
      return true;
    }
  }

  // Check Cache API first
  try {
    const textHash = getTextHash(text);
    const cache = await caches.open(AUDIO_CACHE_NAME);
    const cachedResponse = await cache.match(textHash);
    if (cachedResponse) {
      const audioContent = await cachedResponse.text();
      const audio = new Audio(`data:audio/mp3;base64,${audioContent}`);
      currentAudio = audio;
      audio.onended = () => {
        currentAudio = null;
        if (onEnd) onEnd();
      };
      audio.onerror = (e) => {
        logger.error('Cached audio playback error', e);
        currentAudio = null;
        speakLocalFallback(text, onEnd, onError);
      };
      await audio.play();
      return true;
    }
  } catch (cacheError) {
    logger.warn('Cache lookup failed, proceeding to live request', cacheError);
  }

  // Fail-safe fallback check: If offline, use client-side TTS immediately
  if (!navigator.onLine) {
    logger.warn('User is offline, falling back to local speech synthesis');
    speakLocalFallback(text, onEnd, onError);
    return true;
  }

  try {
    const getTribeAudio = httpsCallable<{ text: string; voice?: string }, { audioContent: string }>(
      functions,
      'getTribeAudio'
    );

    const result = await getTribeAudio({ text, voice: voiceName });
    const audioContent = result.data?.audioContent;

    if (!audioContent) {
      throw new Error('No audio content returned from getTribeAudio Cloud Function');
    }

    // Cache the retrieved audio content
    try {
      const textHash = getTextHash(text);
      const cache = await caches.open(AUDIO_CACHE_NAME);
      await cache.put(textHash, new Response(audioContent));
    } catch (cacheWriteError) {
      logger.warn('Writing to audio cache failed', cacheWriteError);
    }

    // Play backend neural voice
    const audio = new Audio(`data:audio/mp3;base64,${audioContent}`);
    currentAudio = audio;

    audio.onended = () => {
      currentAudio = null;
      if (onEnd) onEnd();
    };

    audio.onerror = (e) => {
      logger.error('Audio playback error', e);
      currentAudio = null;
      logger.warn('Falling back to local speech synthesis after audio playback error');
      speakLocalFallback(text, onEnd, onError);
    };

    await audio.play();
    return true;
  } catch {
    logger.info('Cloud TTS unavailable, playing via browser speech synthesis');
    speakLocalFallback(text, onEnd, onError);
    return true;
  }
}

/**
 * Speak using local browser/OS SpeechSynthesis as a fail-safe fallback
 */
function speakLocalFallback(text: string, onEnd?: () => void, onError?: (err: any) => void) {
  if (!window.speechSynthesis) {
    logger.error('SpeechSynthesis not supported in this browser');
    if (onError) onError(new Error('SpeechSynthesis not supported'));
    return;
  }

  const utterance = new SpeechSynthesisUtterance(text);
  
  // Find best en-GB voice
  const voices = window.speechSynthesis.getVoices();
  const preferredVoice = voices.find(v => v.lang === 'en-GB' && v.name.includes('Google')) || 
                        voices.find(v => v.lang === 'en-GB' && v.name.includes('Female')) || 
                        voices.find(v => v.lang === 'en-GB') ||
                        voices.find(v => v.lang.startsWith('en-GB'));
  
  if (preferredVoice) {
    utterance.voice = preferredVoice;
  }
  
  utterance.lang = 'en-GB';
  utterance.rate = 1.0;
  utterance.pitch = 1.0;
  
  utterance.onend = () => {
    if (onEnd) onEnd();
  };
  
  utterance.onerror = (e) => {
    logger.error('Local speech synthesis error', e);
    if (onError) onError(e);
  };

  window.speechSynthesis.speak(utterance);
}
