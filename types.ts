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
    easeFactor: number;      // Ease factor (starts at 2.5)
    interval: number;        // Days until next review
    repetitions: number;     // Number of successful repetitions
    nextReview: Date;        // When this card should be reviewed next
    lastReviewed: Date;      // When this card was last reviewed
    totalReviews: number;    // Total number of times reviewed
    correctStreak: number;   // Current streak of correct answers
    difficulty: 'new' | 'learning' | 'review'; // Card learning stage
}

export interface ReviewResult {
    quality: number; // 0-5 scale (0=complete blackout, 5=perfect)
    timeSpent?: number; // Time spent on the card in seconds
}

export interface KindleCardsSettings {
	kindlePath: string;
	outputFolder: string;
	cardTemplate: string;
	spacedRepetitionData: Record<string, CardReviewData>;
	enableSpacedRepetition: boolean;
	newCardsPerDay: number;
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
