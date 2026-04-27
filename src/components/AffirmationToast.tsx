import { useEffect, useState } from 'react';
import { Heart } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

const AFFIRMATIONS = [
  "You are exactly where you need to be.",
  "Your feelings are valid and worthy of attention.",
  "Take all the time you need. There is no rush here.",
  "You deserve moments of peace and gentleness.",
  "Every breath is a new beginning.",
];

export function AffirmationToast() {
  const [show, setShow] = useState(false);
  const [affirmation, setAffirmation] = useState('');

  useEffect(() => {
    const lastShown = localStorage.getItem('lumina-affirmation-date');
    const today = new Date().toDateString();

    if (lastShown !== today) {
      const randomAffirmation = AFFIRMATIONS[Math.floor(Math.random() * AFFIRMATIONS.length)];
      setAffirmation(randomAffirmation);
      setShow(true);
      localStorage.setItem('lumina-affirmation-date', today);

      const timer = setTimeout(() => setShow(false), 5000);
      return () => clearTimeout(timer);
    }
  }, []);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="affirmation-toast"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="affirmation-content">
            <div className="affirmation-icon">
              <Heart size={20} />
            </div>
            <p className="affirmation-text">{affirmation}</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
