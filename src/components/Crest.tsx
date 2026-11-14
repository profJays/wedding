import React from 'react';

interface CrestProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const Crest: React.FC<CrestProps> = ({ className = '', size = 'md' }) => {
  const sizeMap = {
    sm: 'w-12 h-12',
    md: 'w-20 h-20',
    lg: 'w-28 h-28'
  };

  return (
    <div className={`relative inline-flex items-center justify-center ${sizeMap[size]} ${className}`}>
      {/* Outer decorative ring with emerald and gold tones */}
      <svg
        viewBox="0 0 100 100"
        className="w-full h-full text-[#0F5132]"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Laurel Wreath Left */}
        <path
          d="M 50 88 C 30 85 16 68 18 45 C 19 32 28 18 42 12"
          stroke="#0F5132"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeDasharray="2 1"
          opacity="0.8"
        />
        {/* Laurel Wreath Right */}
        <path
          d="M 50 88 C 70 85 84 68 82 45 C 81 32 72 18 58 12"
          stroke="#0F5132"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeDasharray="2 1"
          opacity="0.8"
        />
        
        {/* Leaf details with Olive & Gold touches */}
        <path d="M 23 48 C 21 44 23 39 26 38 C 26 43 25 46 23 48 Z" fill="#556B2F" opacity="0.6" />
        <path d="M 77 48 C 79 44 77 39 74 38 C 74 43 75 46 77 48 Z" fill="#556B2F" opacity="0.6" />
        <path d="M 28 32 C 27 27 32 24 35 25 C 34 29 31 31 28 32 Z" fill="#D4AF37" opacity="0.7" />
        <path d="M 72 32 C 73 27 68 24 65 25 C 66 29 69 31 72 32 Z" fill="#D4AF37" opacity="0.7" />
        <path d="M 37 19 C 39 15 45 15 47 17 C 44 20 40 20 37 19 Z" fill="#0F5132" opacity="0.6" />
        <path d="M 63 19 C 61 15 55 15 53 17 C 56 20 60 20 63 19 Z" fill="#0F5132" opacity="0.6" />

        {/* Inner thin circles in Gold */}
        <circle cx="50" cy="50" r="32" stroke="#D4AF37" strokeWidth="0.8" opacity="0.6" />
        <circle cx="50" cy="50" r="30" stroke="#D4AF37" strokeWidth="0.5" strokeDasharray="1 2" opacity="0.7" />

        {/* Bottom Knot ribbon in Emerald */}
        <path
          d="M 46 88 C 48 85 52 85 54 88 C 52 91 48 91 46 88 Z"
          fill="#D4AF37"
          opacity="0.85"
        />
      </svg>

      {/* Monogram inside: D & J */}
      <div className="absolute inset-0 flex items-center justify-center font-serif text-[#0F5132]">
        <span className="text-sm font-semibold tracking-tighter">D</span>
        <span className="font-script text-xs mx-0.5 text-[#D4AF37] font-normal">&amp;</span>
        <span className="text-sm font-semibold tracking-tighter">J</span>
      </div>
    </div>
  );
};
