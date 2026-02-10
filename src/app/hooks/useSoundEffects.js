'use client';

import { useCallback, useRef, useEffect, useState } from 'react';

/**
 * Sound Effects Hook
 * Plays satisfying audio feedback for quiz interactions
 * Respects user preferences for sound
 */
export default function useSoundEffects() {
    const [soundEnabled, setSoundEnabled] = useState(true);
    const audioContextRef = useRef(null);
    const gainNodeRef = useRef(null);

    // Initialize AudioContext on first interaction
    const initAudio = useCallback(() => {
        if (!audioContextRef.current && typeof window !== 'undefined') {
            try {
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                audioContextRef.current = new AudioContext();
                gainNodeRef.current = audioContextRef.current.createGain();
                gainNodeRef.current.connect(audioContextRef.current.destination);
                gainNodeRef.current.gain.value = 0.15; // Keep sounds subtle
            } catch (e) {
                console.warn('Web Audio API not supported:', e);
            }
        }
        return audioContextRef.current;
    }, []);

    // Load saved preference on mount
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('soundEffectsEnabled');
            if (saved !== null) {
                setSoundEnabled(JSON.parse(saved));
            }
        }
    }, []);

    // Save preference when changed
    const toggleSound = useCallback(() => {
        setSoundEnabled(prev => {
            const newValue = !prev;
            localStorage.setItem('soundEffectsEnabled', JSON.stringify(newValue));
            return newValue;
        });
    }, []);

    // Play a pleasant "pop" sound for selections
    const playSelect = useCallback(() => {
        if (!soundEnabled) return;
        const ctx = initAudio();
        if (!ctx || !gainNodeRef.current) return;

        // Resume context if suspended
        if (ctx.state === 'suspended') {
            ctx.resume();
        }

        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        oscillator.frequency.setValueAtTime(800, ctx.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.05);

        gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);

        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 0.1);
    }, [soundEnabled, initAudio]);

    // Play a cheerful "correct" sound
    const playCorrect = useCallback(() => {
        if (!soundEnabled) return;
        const ctx = initAudio();
        if (!ctx || !gainNodeRef.current) return;

        if (ctx.state === 'suspended') {
            ctx.resume();
        }

        // Create a pleasant rising chord
        const frequencies = [523.25, 659.25, 783.99]; // C5, E5, G5 - Major chord

        frequencies.forEach((freq, index) => {
            const oscillator = ctx.createOscillator();
            const gainNode = ctx.createGain();

            oscillator.type = 'sine';
            oscillator.connect(gainNode);
            gainNode.connect(ctx.destination);

            oscillator.frequency.setValueAtTime(freq, ctx.currentTime + index * 0.05);

            gainNode.gain.setValueAtTime(0, ctx.currentTime + index * 0.05);
            gainNode.gain.linearRampToValueAtTime(0.08, ctx.currentTime + index * 0.05 + 0.05);
            gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);

            oscillator.start(ctx.currentTime + index * 0.05);
            oscillator.stop(ctx.currentTime + 0.5);
        });
    }, [soundEnabled, initAudio]);

    // Play an "wrong answer" sound
    const playIncorrect = useCallback(() => {
        if (!soundEnabled) return;
        const ctx = initAudio();
        if (!ctx || !gainNodeRef.current) return;

        if (ctx.state === 'suspended') {
            ctx.resume();
        }

        // Play a descending minor tone
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();

        oscillator.type = 'sine';
        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        oscillator.frequency.setValueAtTime(400, ctx.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(250, ctx.currentTime + 0.2);

        gainNode.gain.setValueAtTime(0.08, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);

        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 0.3);
    }, [soundEnabled, initAudio]);

    // Play a celebratory fanfare for high scores
    const playCelebration = useCallback(() => {
        if (!soundEnabled) return;
        const ctx = initAudio();
        if (!ctx || !gainNodeRef.current) return;

        if (ctx.state === 'suspended') {
            ctx.resume();
        }

        // Create an ascending arpeggio
        const notes = [
            { freq: 523.25, time: 0 },      // C5
            { freq: 659.25, time: 0.1 },    // E5
            { freq: 783.99, time: 0.2 },    // G5
            { freq: 1046.5, time: 0.3 },    // C6
            { freq: 1318.5, time: 0.45 },   // E6
        ];

        notes.forEach(({ freq, time }) => {
            const oscillator = ctx.createOscillator();
            const gainNode = ctx.createGain();

            oscillator.type = 'sine';
            oscillator.connect(gainNode);
            gainNode.connect(ctx.destination);

            oscillator.frequency.setValueAtTime(freq, ctx.currentTime + time);

            gainNode.gain.setValueAtTime(0, ctx.currentTime + time);
            gainNode.gain.linearRampToValueAtTime(0.1, ctx.currentTime + time + 0.05);
            gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + time + 0.3);

            oscillator.start(ctx.currentTime + time);
            oscillator.stop(ctx.currentTime + time + 0.35);
        });
    }, [soundEnabled, initAudio]);

    // Play a subtle tick sound
    const playTick = useCallback(() => {
        if (!soundEnabled) return;
        const ctx = initAudio();
        if (!ctx || !gainNodeRef.current) return;

        if (ctx.state === 'suspended') {
            ctx.resume();
        }

        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();

        oscillator.type = 'sine';
        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        oscillator.frequency.setValueAtTime(1000, ctx.currentTime);

        gainNode.gain.setValueAtTime(0.05, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.03);

        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 0.03);
    }, [soundEnabled, initAudio]);

    // Clean up AudioContext on unmount
    useEffect(() => {
        return () => {
            if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
                audioContextRef.current.close();
            }
        };
    }, []);

    return {
        soundEnabled,
        toggleSound,
        playSelect,
        playCorrect,
        playIncorrect,
        playCelebration,
        playTick,
        initAudio,
    };
}
