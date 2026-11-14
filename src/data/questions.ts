import { Question } from '../types';

export const WEDDING_QUESTIONS: Question[] = [
  {
    id: 1,
    question: 'Will you be attending our wedding?',
    subtitle: 'The golden question that sets your destiny.',
    options: [
      {
        id: 'q1_a',
        text: "Absolutely! Wouldn't miss it.",
        verdict: "Front row seating energy! That's what Damilola & Joseph love to hear.",
        personaTag: 'Day-One Devotee'
      },
      {
        id: 'q1_b',
        text: "Of course, I've been waiting for this!",
        verdict: "The enthusiasm is unmatched! Get ready for an unforgettable day.",
        personaTag: 'Ultimate Hype Friend'
      },
      {
        id: 'q1_c',
        text: "I'll try my best.",
        verdict: "‘Try’? Clear your calendar right now, there is no trying when Damilola & Joseph marry!",
        personaTag: 'Pending Attendance'
      },
      {
        id: 'q1_d',
        text: 'Can I come with someone?',
        verdict: 'Checking the strictly vetted guest registry... only if they have immaculate dance moves!',
        personaTag: 'Plus-One Negotiator'
      }
    ]
  },
  {
    id: 2,
    question: 'How excited are you for our wedding?',
    subtitle: 'Be honest—are you here for the romance or the party?',
    options: [
      {
        id: 'q2_a',
        text: 'Extremely excited!',
        verdict: "We knew you had top-tier taste. You're officially our favorite!",
        personaTag: 'Pure Joy Ambassador'
      },
      {
        id: 'q2_b',
        text: "I can't wait!",
        verdict: 'Counting down every single second right alongside Damilola & Joseph!',
        personaTag: 'Countdown Captain'
      },
      {
        id: 'q2_c',
        text: "I'm only coming for the food.",
        verdict: 'We respect the honesty! The jollof, small chops, and banquet will not disappoint.',
        personaTag: 'Jollof Connoisseur'
      },
      {
        id: 'q2_d',
        text: "I'm here for the dance floor.",
        verdict: 'Better stretch your hamstrings now. DJ is booked and the dance floor will be electric!',
        personaTag: 'Dance Floor Royalty'
      }
    ]
  },
  {
    id: 3,
    question: 'Are you going to cry during the ceremony?',
    subtitle: 'Vow delivery protocol: prepare your tear ducts.',
    options: [
      {
        id: 'q3_a',
        text: 'Obviously!',
        verdict: 'Monogrammed handkerchiefs will be delivered to your seat on arrival.',
        personaTag: 'Emotional Softie'
      },
      {
        id: 'q3_b',
        text: 'Absolutely nothing can make me cry.',
        verdict: 'Stone-cold composure? We’ll check on you the moment the vows begin!',
        personaTag: 'Steel-Faced Witness'
      },
      {
        id: 'q3_c',
        text: "I'll try to hold it together.",
        verdict: 'Waterproof mascara is strictly mandatory for your own safety.',
        personaTag: 'Brave Sniffler'
      },
      {
        id: 'q3_d',
        text: 'Only if everyone else cries.',
        verdict: 'Solidarity crying. We respect group emotional harmony!',
        personaTag: 'Sympathetic Weeper'
      }
    ]
  },
  {
    id: 4,
    question: 'What are you bringing as a wedding gift?',
    subtitle: 'Checking registry etiquette and generosity indexes.',
    options: [
      {
        id: 'q4_a',
        text: 'Cash, obviously.',
        verdict: "Joseph's favorite answer! Account number and registry envelopes are primed.",
        personaTag: 'Honeymoon Benefactor'
      },
      {
        id: 'q4_b',
        text: 'Something from the registry.',
        verdict: 'Orderly, polite, and respectful. Damilola sheds a tear of pure appreciation!',
        personaTag: 'Registry Virtuoso'
      },
      {
        id: 'q4_c',
        text: 'Something thoughtful.',
        verdict: 'Sentimental, curated, and personalized. We are truly touched!',
        personaTag: 'Sentimental Soul'
      },
      {
        id: 'q4_d',
        text: 'My presence is the gift.',
        verdict: 'The sheer audacity! We admire the unshakeable confidence though.',
        personaTag: 'Self-Proclaimed Treasure'
      }
    ]
  },
  {
    id: 5,
    question: 'What colour are you wearing to our wedding?',
    subtitle: 'Warning: Choose wisely. This is the ultimate test.',
    options: [
      {
        id: 'q5_white',
        text: 'White.',
        verdict: 'RED ALERT! Unforgivable wedding protocol violation!',
        isFatal: true,
        personaTag: 'Rule Breaker'
      },
      {
        id: 'q5_emerald',
        text: 'Emerald green.',
        verdict: 'The signature color of the day! Majestic, radiant, and regal. 10/10 perfection!',
        personaTag: 'Emerald Royalty'
      },
      {
        id: 'q5_olive_gold',
        text: 'Olive green & gold.',
        verdict: 'Matching our aesthetic palette like fashion nobility! Absolutely stunning.',
        personaTag: 'Golden Olive Icon'
      },
      {
        id: 'q5_red',
        text: 'Bold red or festive bright colors.',
        verdict: 'Vibrant, joyful, and high celebration vibes! Just promise not to outshine the bride.',
        personaTag: 'Celebration Vanguard'
      },
      {
        id: 'q5_whatever',
        text: 'Whatever Damilola tells me to wear.',
        verdict: 'The dream guest has spoken! 100% compliance and utmost respect for the bride.',
        personaTag: 'The Model Attendee'
      }
    ]
  }
];
