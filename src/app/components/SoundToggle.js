'use client';

import { Button } from 'react-bootstrap';
import Icon from './Icon';
import useSoundEffects from '../hooks/useSoundEffects';
import { useLanguage } from '../context/LanguageContext';

/**
 * Sound Toggle Button Component
 * Allows users to enable/disable sound effects
 */
export default function SoundToggle({ className = '', variant = 'ghost' }) {
    const { t } = useLanguage();
    const { soundEnabled, toggleSound, playTick } = useSoundEffects();

    const handleClick = () => {
        toggleSound();
        // Play a tick when enabling (to confirm sound is on)
        if (!soundEnabled) {
            setTimeout(() => playTick(), 50);
        }
    };

    return (
        <Button
            variant={variant}
            onClick={handleClick}
            className={`d-flex align-items-center justify-content-center ${className}`}
            style={{
                width: '44px',
                height: '44px',
                borderRadius: '50%',
                padding: 0,
            }}
            aria-label={soundEnabled ? t('disableSoundEffects') : t('enableSoundEffects')}
            title={soundEnabled ? t('soundOn') : t('soundOff')}
        >
            <Icon
                name={soundEnabled ? 'volumeUp' : 'volumeMute'}
                size={20}
                className={soundEnabled ? 'text-primary' : 'text-muted'}
            />
        </Button>
    );
}
