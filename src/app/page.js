'use client';

import { useState, useEffect } from 'react';
import 'bootstrap/dist/css/bootstrap.min.css';

export default function Home() {
  const [days, setDays] = useState(0);
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(0);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const calculateTimeLeft = () => {
      const now = new Date();
      const nextMonday = new Date(now);
      nextMonday.setDate(now.getDate() + (1 + 7 - now.getDay()) % 7);
      nextMonday.setHours(0, 0, 0, 0); // Set to midnight of next Monday

      const distance = nextMonday.getTime() - now.getTime();

      if (distance < 0) {
        setDays(0);
        setHours(0);
        setMinutes(0);
        setSeconds(0);
        return;
      }

      setDays(Math.floor(distance / (1000 * 60 * 60 * 24)));
      setHours(Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)));
      setMinutes(Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60)));
      setSeconds(Math.floor((distance % (1000 * 60)) / 1000));
    };

    calculateTimeLeft();
    const interval = setInterval(calculateTimeLeft, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="container d-flex flex-column align-items-center justify-content-center min-vh-100 bg-light text-dark">
      <h1 className="display-4 mb-4">Selftest.in - Coming Soon!</h1>
      <p className="lead mb-5">We are working hard to bring you something amazing. Stay tuned!</p>
      <div className="d-flex justify-content-center text-center mb-5">
        <div className="p-3 border rounded mx-2 bg-white shadow-sm">
          <h2 className="display-5">{days}</h2>
          <p className="text-muted">Days</p>
        </div>
        <div className="p-3 border rounded mx-2 bg-white shadow-sm">
          <h2 className="display-5">{hours}</h2>
          <p className="text-muted">Hours</p>
        </div>
        <div className="p-3 border rounded mx-2 bg-white shadow-sm">
          <h2 className="display-5">{minutes}</h2>
          <p className="text-muted">Minutes</p>
        </div>
        <div className="p-3 border rounded mx-2 bg-white shadow-sm">
          <h2 className="display-5">{seconds}</h2>
          <p className="text-muted">Seconds</p>
        </div>
      </div>
      <p className="text-muted">Follow us for updates!</p>
      {/* Add social media links here if desired */}
    </div>
  );
}
