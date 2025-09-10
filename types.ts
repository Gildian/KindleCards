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
	
	// Study Experience Settings
	enableCardFlipAnimation: boolean; // Animate card flipping
	showProgressStats: boolean; // Show progress during study
	enableKeyboardShortcuts: boolean; // Enable keyboard shortcuts (1-4 for answers)
	autoShowAnswer: boolean; // Automatically show answer after delay
	autoShowAnswerDelay: number; // Delay in seconds before showing answer
	enableFullscreenStudy: boolean; // Open study modal in fullscreen
	showTimerDuringStudy: boolean; // Show timer for each card
	enableSoundEffects: boolean; // Play sounds for correct/incorrect answers
	
	// Content Processing Settings
	includeHighlightedText: boolean; // Include highlighted text in cards
	includeBookNotes: boolean; // Include book notes in cards
	includeLocationInfo: boolean; // Include location/page info in cards
	minimumContentLength: number; // Minimum characters for valid content
	maximumContentLength: number; // Maximum characters for content (truncate)
	excludePatterns: string[]; // Regex patterns to exclude from content
	includeOnlyPatterns: string[]; // Only include content matching these patterns
	
	// File Organization Settings
	groupCardsByBook: boolean; // Group cards in separate folders by book
	useBookAuthorFolders: boolean; // Create author-based folder structure
	generateTOC: boolean; // Generate table of contents file
	includeMetadataFiles: boolean; // Generate metadata JSON files
	cardFileNamingFormat: string; // Format for card filenames
	enableAutoSync: boolean; // Auto-sync when Kindle files change
	backupBeforeSync: boolean; // Create backup before syncing
	
	// UI/UX Preferences
	preferredTheme: 'light' | 'dark' | 'auto'; // Theme preference
	compactMode: boolean; // Use compact UI layout
	showBookCovers: boolean; // Show book covers when available
	enableBulkOperations: boolean; // Enable bulk edit/delete operations
	confirmDeletions: boolean; // Confirm before deleting cards
	showAdvancedStats: boolean; // Show detailed statistics
	
	// Performance Settings
	maxCardsInMemory: number; // Maximum cards to keep in memory
	enableBackgroundSync: boolean; // Sync in background
	cacheBookData: boolean; // Cache book metadata
	enableDebugLogging: boolean; // Enable debug logging
	
	// Export/Import Settings
	exportIncludeStats: boolean; // Include stats in export
	exportFormat: 'json' | 'csv' | 'anki'; // Default export format
	enableAutoExport: boolean; // Auto-export data periodically
	autoExportInterval: number; // Hours between auto-exports
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
