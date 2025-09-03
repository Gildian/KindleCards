/**
 * Shared types and interfaces for KindleCards plugin
 */

export interface KindleClipping {
	title: string;
	author: string;
	type: string;
	location: string;
	date: string;
	content: string;
}

export interface CardReviewData {
    cardId: string;
    easeFactor: number;      // Ease factor (starts at 2.5, like Anki)
    interval: number;        // Days until next review
    repetitions: number;     // Number of successful repetitions
    nextReview: Date;        // When this card should be reviewed next
    lastReviewed: Date;      // When this card was last reviewed
    totalReviews: number;    // Total number of times reviewed
    correctStreak: number;   // Current streak of correct answers
    difficulty: 'new' | 'learning' | 'review' | 'relearning'; // Card learning stage
    lapses: number;          // Number of times card has lapsed (failed)
    learningSteps: number[]; // Current position in learning steps
    currentStep: number;     // Current step index in learning
    graduated: boolean;      // Has card graduated from learning?
    buried: boolean;         // Is card buried until tomorrow?
}

export interface ReviewResult {
    quality: 'again' | 'hard' | 'good' | 'easy'; // Anki's 4-button system
    timeSpent?: number; // Time spent on the card in seconds
}

export interface KindleCardsSettings {
	kindlePath: string;
	outputFolder: string;
	cardTemplate: string;
	spacedRepetitionData: Record<string, CardReviewData>;
	enableSpacedRepetition: boolean;
	newCardsPerDay: number;
	// Anki-like SRS Settings
	learningSteps: number[]; // Learning steps in minutes (e.g., [1, 10])
	relearningSteps: number[]; // Relearning steps in minutes
	graduatingInterval: number; // Days for first review after graduating
	easyInterval: number; // Days for easy button in learning
	startingEase: number; // Starting ease factor (250% = 2.5)
	easyBonus: number; // Easy bonus multiplier (130% = 1.3)
	intervalModifier: number; // Global interval modifier (100% = 1.0)
	maximumInterval: number; // Maximum interval in days
	hardInterval: number; // Hard interval multiplier (120% = 1.2)
	newInterval: number; // New interval after lapse (0% = 0.0)
	minimumInterval: number; // Minimum interval in days
	leechThreshold: number; // Number of lapses before card becomes leech
	maximumReviewsPerDay: number;
}

export interface BookGroup {
    title: string;
    author: string;
    flashcards: KindleClipping[];
    count: number;
}

export interface StudyStats {
    total: number;
    correct: number;
    incorrect: number;
    remaining: number;
    reviewed: number;
}

export interface SpacedRepetitionStats {
    total: number;
    new: number;
    learning: number;
    review: number;
    due: number;
    averageEase: number;
}

// Forward declaration interface for plugin to avoid circular dependencies
export interface IKindleCardsPlugin {
    spacedRepetition: any;
    settings: KindleCardsSettings;
    saveSettings(): Promise<void>;
}
