import { CardReviewData, ReviewResult, SpacedRepetitionStats, KindleCardsSettings } from './types';
import { DebugLogger } from './logger';

/**
 * Anki-compatible Spaced Repetition System
 *
 * This implementation replicates Anki's scheduling algorithm:
 * - 4-button system: Again, Hard, Good, Easy
 * - Learning/Relearning steps in minutes
 * - Graduating intervals
 * - Ease factor adjustments
 * - Interval modifiers
 * - Lapse handling
 */
export class SpacedRepetitionSystem {
    private reviewData: Map<string, CardReviewData> = new Map();
    private settings: KindleCardsSettings;

    constructor(savedData?: Record<string, CardReviewData>, settings?: KindleCardsSettings) {
        this.settings = settings || {
            learningSteps: [1, 10],
            relearningSteps: [10],
            graduatingInterval: 1,
            easyInterval: 4,
            startingEase: 2.5,
            easyBonus: 1.3,
            intervalModifier: 1.0,
            maximumInterval: 36500,
            hardInterval: 1.2,
            newInterval: 0.0,
            minimumInterval: 1,
            leechThreshold: 8,
        } as KindleCardsSettings;
        this.loadData(savedData);
    }

    /**
     * Update the settings used by the SRS system
     */
    updateSettings(settings: KindleCardsSettings): void {
        this.settings = settings;
    }

    /**
     * Load saved review data, converting date strings back to Date objects
     */
    private loadData(savedData?: Record<string, CardReviewData>): void {
        if (!savedData) return;

        for (const [cardId, data] of Object.entries(savedData)) {
            try {
                // Handle migration from old format
                const cardData: CardReviewData = {
                    ...data,
                    nextReview: new Date(data.nextReview),
                    lastReviewed: new Date(data.lastReviewed),
                    // Add new Anki-like properties if missing
                    lapses: data.lapses || 0,
                    learningSteps: data.learningSteps || [],
                    currentStep: data.currentStep || 0,
                    graduated: data.graduated !== undefined ? data.graduated : data.difficulty === 'review',
                    buried: data.buried || false,
                    difficulty: this.migrateDifficulty(data.difficulty)
                };
                this.reviewData.set(cardId, cardData);
            } catch (error) {
                console.warn(`Failed to load review data for card ${cardId}:`, error);
            }
        }
    }

    /**
     * Migrate old difficulty values to new format
     */
    private migrateDifficulty(oldDifficulty: string): 'new' | 'learning' | 'review' | 'relearning' {
        switch (oldDifficulty) {
            case 'new': return 'new';
            case 'learning': return 'learning';
            case 'review': return 'review';
            default: return 'new';
        }
    }

    /**
     * Get or initialize review data for a card
     */
    getCardData(cardId: string): CardReviewData {
        if (!this.reviewData.has(cardId)) {
            this.reviewData.set(cardId, this.createNewCardData(cardId));
        }
        return this.reviewData.get(cardId)!;
    }

    /**
     * Create initial data structure for a new card (Anki-like)
     */
    private createNewCardData(cardId: string): CardReviewData {
        return {
            cardId,
            easeFactor: this.settings.startingEase || 2.5,
            interval: 0, // Will be set when card graduates
            repetitions: 0,
            nextReview: new Date(), // Due now
            lastReviewed: new Date(0),
            totalReviews: 0,
            correctStreak: 0,
            difficulty: 'new',
            lapses: 0,
            learningSteps: [...(this.settings.learningSteps || [1, 10])],
            currentStep: 0,
            graduated: false,
            buried: false
        };
    }

    /**
     * Review a card with Anki's 4-button system
     */
    reviewCard(cardId: string, result: ReviewResult): CardReviewData {
        const data = this.getCardData(cardId);
        const now = new Date();

        data.lastReviewed = now;
        data.totalReviews++;

        switch (data.difficulty) {
            case 'new':
                this.handleNewCard(data, result.quality, now);
                break;
            case 'learning':
                this.handleLearningCard(data, result.quality, now);
                break;
            case 'review':
                this.handleReviewCard(data, result.quality, now);
                break;
            case 'relearning':
                this.handleRelearningCard(data, result.quality, now);
                break;
        }

        // Check for leeches
        if (data.lapses >= (this.settings.leechThreshold || 8)) {
            data.buried = true;
            DebugLogger.log(`Card ${cardId} is now a leech (${data.lapses} lapses)`);
        }

        return data;
    }

    /**
     * Handle new card review (Anki logic)
     */
    private handleNewCard(data: CardReviewData, quality: string, now: Date): void {
        data.difficulty = 'learning';
        data.currentStep = 0;

        switch (quality) {
            case 'again':
                this.scheduleInLearning(data, 0, now); // Back to first step
                break;
            case 'hard':
            case 'good':
                this.scheduleInLearning(data, 0, now); // Start learning
                break;
            case 'easy':
                // Graduate immediately with easy interval
                this.graduateCard(data, this.settings.easyInterval || 4, now);
                break;
        }
    }

    /**
     * Handle learning card review (Anki logic)
     */
    private handleLearningCard(data: CardReviewData, quality: string, now: Date): void {
        switch (quality) {
            case 'again':
                data.currentStep = 0; // Back to first step
                this.scheduleInLearning(data, 0, now);
                break;
            case 'hard':
                // Stay on current step or go back one
                const hardStep = Math.max(0, data.currentStep - 1);
                this.scheduleInLearning(data, hardStep, now);
                break;
            case 'good':
                // Advance to next step or graduate
                if (data.currentStep < data.learningSteps.length - 1) {
                    data.currentStep++;
                    this.scheduleInLearning(data, data.currentStep, now);
                } else {
                    // Graduate!
                    this.graduateCard(data, this.settings.graduatingInterval || 1, now);
                }
                break;
            case 'easy':
                // Graduate with easy interval
                this.graduateCard(data, this.settings.easyInterval || 4, now);
                break;
        }
    }

    /**
     * Handle review card (mature card) review (Anki logic)
     */
    private handleReviewCard(data: CardReviewData, quality: string, now: Date): void {
        const oldInterval = data.interval;

        switch (quality) {
            case 'again':
                // Card lapses - goes to relearning
                data.lapses++;
                data.difficulty = 'relearning';
                data.currentStep = 0;
                data.learningSteps = [...(this.settings.relearningSteps || [10])];
                data.easeFactor = Math.max(1.3, data.easeFactor - 0.2); // Reduce ease

                // New interval calculation for lapsed cards
                const newInterval = Math.max(1, Math.floor(oldInterval * (this.settings.newInterval || 0.0)));
                data.interval = newInterval;

                this.scheduleInLearning(data, 0, now);
                break;
            case 'hard':
                // Hard interval: previous * 1.2 * interval modifier
                data.interval = Math.max(
                    data.interval + 1,
                    Math.floor(oldInterval * (this.settings.hardInterval || 1.2) * (this.settings.intervalModifier || 1.0))
                );
                data.easeFactor = Math.max(1.3, data.easeFactor - 0.15); // Decrease ease
                this.scheduleReview(data, now);
                break;
            case 'good':
                // Good interval: previous * ease * interval modifier
                data.interval = Math.floor(oldInterval * data.easeFactor * (this.settings.intervalModifier || 1.0));
                data.repetitions++;
                data.correctStreak++;
                this.scheduleReview(data, now);
                break;
            case 'easy':
                // Easy interval: previous * ease * easy bonus * interval modifier
                data.interval = Math.floor(
                    oldInterval * data.easeFactor * (this.settings.easyBonus || 1.3) * (this.settings.intervalModifier || 1.0)
                );
                data.easeFactor += 0.15; // Increase ease
                data.repetitions++;
                data.correctStreak++;
                this.scheduleReview(data, now);
                break;
        }

        // Cap at maximum interval
        data.interval = Math.min(data.interval, this.settings.maximumInterval || 36500);
    }

    /**
     * Handle relearning card review (Anki logic)
     */
    private handleRelearningCard(data: CardReviewData, quality: string, now: Date): void {
        switch (quality) {
            case 'again':
                data.currentStep = 0; // Back to first relearning step
                this.scheduleInLearning(data, 0, now);
                break;
            case 'hard':
                // Stay on current step or go back
                const hardStep = Math.max(0, data.currentStep - 1);
                this.scheduleInLearning(data, hardStep, now);
                break;
            case 'good':
                // Advance in relearning or return to review
                if (data.currentStep < data.learningSteps.length - 1) {
                    data.currentStep++;
                    this.scheduleInLearning(data, data.currentStep, now);
                } else {
                    // Return to review with previous interval
                    data.difficulty = 'review';
                    data.graduated = true;
                    this.scheduleReview(data, now);
                }
                break;
            case 'easy':
                // Return to review with easy bonus
                data.difficulty = 'review';
                data.graduated = true;
                data.interval = Math.floor(data.interval * (this.settings.easyBonus || 1.3));
                this.scheduleReview(data, now);
                break;
        }
    }

    /**
     * Schedule a card in learning/relearning phase
     */
    private scheduleInLearning(data: CardReviewData, stepIndex: number, now: Date): void {
        data.currentStep = stepIndex;
        const minutes = data.learningSteps[stepIndex] || 1;
        data.nextReview = new Date(now.getTime() + minutes * 60 * 1000);
    }

    /**
     * Graduate a card from learning to review
     */
    private graduateCard(data: CardReviewData, interval: number, now: Date): void {
        data.difficulty = 'review';
        data.graduated = true;
        data.interval = interval;
        data.repetitions = 1;
        data.correctStreak = 1;
        this.scheduleReview(data, now);
    }

    /**
     * Schedule a review card
     */
    private scheduleReview(data: CardReviewData, now: Date): void {
        const intervalMs = data.interval * 24 * 60 * 60 * 1000;
        data.nextReview = new Date(now.getTime() + intervalMs);
    }

    /**
     * Get cards that are due for review (including learning cards)
     */
    getDueCards(cardIds: string[]): string[] {
        const now = new Date();
        const dueCards = cardIds.filter(cardId => {
            const data = this.getCardData(cardId);
            return !data.buried && data.nextReview <= now;
        });

        // Apply maximum reviews per day limit if set
        const maxReviews = this.settings.maximumReviewsPerDay || 0;
        if (maxReviews > 0) {
            return dueCards.slice(0, maxReviews);
        }

        return dueCards;
    }

    /**
     * Get new cards up to the daily limit
     */
    getNewCards(cardIds: string[]): string[] {
        const newCards = cardIds.filter(cardId => {
            const data = this.getCardData(cardId);
            return !data.buried && data.difficulty === 'new';
        });

        // Apply new cards per day limit
        const maxNewCards = this.settings.newCardsPerDay || 20;
        return newCards.slice(0, maxNewCards);
    }

    /**
     * Get cards for study session, respecting all daily limits (Anki-like)
     */
    getStudyCards(cardIds: string[]): string[] {
        // Get due cards (learning, relearning, and due review cards)
        const now = new Date();
        const dueCards = cardIds.filter(cardId => {
            const data = this.getCardData(cardId);
            if (data.buried) return false;

            return data.nextReview <= now && (
                data.difficulty === 'learning' ||
                data.difficulty === 'relearning' ||
                data.difficulty === 'review'
            );
        });

        // Get new cards
        const newCards = this.getNewCards(cardIds);

        // Combine and limit
        const studyCards = [...dueCards, ...newCards];
        const maxReviews = this.settings.maximumReviewsPerDay || 0;

        if (maxReviews > 0) {
            return studyCards.slice(0, maxReviews);
        }

        return studyCards;
    }

    /**
     * Get cards sorted by review priority (Anki-like)
     */
    getSortedCards(cardIds: string[]): string[] {
        const now = new Date();

        return cardIds.sort((a, b) => {
            const dataA = this.getCardData(a);
            const dataB = this.getCardData(b);

            // Buried cards go last
            if (dataA.buried && !dataB.buried) return 1;
            if (!dataA.buried && dataB.buried) return -1;

            // Learning/relearning cards first (most urgent)
            if ((dataA.difficulty === 'learning' || dataA.difficulty === 'relearning') &&
                (dataB.difficulty !== 'learning' && dataB.difficulty !== 'relearning')) return -1;
            if ((dataA.difficulty !== 'learning' && dataA.difficulty !== 'relearning') &&
                (dataB.difficulty === 'learning' || dataB.difficulty === 'relearning')) return 1;

            // Among learning cards, sort by next review time
            if ((dataA.difficulty === 'learning' || dataA.difficulty === 'relearning') &&
                (dataB.difficulty === 'learning' || dataB.difficulty === 'relearning')) {
                return dataA.nextReview.getTime() - dataB.nextReview.getTime();
            }

            // Due review cards next
            const aDue = dataA.nextReview <= now;
            const bDue = dataB.nextReview <= now;

            if (aDue && !bDue) return -1;
            if (!aDue && bDue) return 1;

            // Among due cards, most overdue first
            if (aDue && bDue) {
                return dataA.nextReview.getTime() - dataB.nextReview.getTime();
            }

            // New cards last
            if (dataA.difficulty === 'new' && dataB.difficulty !== 'new') return 1;
            if (dataA.difficulty !== 'new' && dataB.difficulty === 'new') return -1;

            // Finally, sort by ease factor (lower = more difficult)
            return dataA.easeFactor - dataB.easeFactor;
        });
    }

    /**
     * Get comprehensive study statistics (Anki-like)
     */
    getStats(cardIds: string[]): SpacedRepetitionStats {
        const now = new Date();
        const stats = {
            total: cardIds.length,
            new: 0,
            learning: 0,
            review: 0,
            due: 0,
            averageEase: 0
        };

        let totalEase = 0;
        let easeCount = 0;

        for (const cardId of cardIds) {
            const data = this.getCardData(cardId);

            if (data.buried) continue;

            // Count by difficulty
            if (data.difficulty === 'new') {
                stats.new++;
            } else if (data.difficulty === 'learning' || data.difficulty === 'relearning') {
                stats.learning++;
                if (data.nextReview <= now) stats.due++;
            } else if (data.difficulty === 'review') {
                stats.review++;
                if (data.nextReview <= now) stats.due++;
                totalEase += data.easeFactor;
                easeCount++;
            }
        }

        stats.averageEase = easeCount > 0 ? totalEase / easeCount : (this.settings.startingEase || 2.5);
        return stats;
    }

    /**
     * Export data for persistence (converts Dates to strings)
     */
    exportData(): Record<string, CardReviewData> {
        const exported: Record<string, CardReviewData> = {};
        for (const [cardId, data] of this.reviewData) {
            exported[cardId] = { ...data };
        }
        return exported;
    }

    /**
     * Generate a unique, stable card ID from clipping data
     */
    static generateCardId(title: string, author: string, content: string): string {
        if (!title || !author || !content) {
            throw new Error('Card ID generation requires title, author, and content');
        }

        const combined = `${title.trim()}|${author.trim()}|${content.substring(0, 100).trim()}`;
        return this.hashString(combined);
    }

    /**
     * Simple hash function that works with Unicode characters
     */
    private static hashString(str: string): string {
        let hash = 0;

        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }

        // Convert to positive hex string and ensure consistent length
        const hashStr = Math.abs(hash).toString(16);
        return hashStr.padStart(8, '0');
    }
}
