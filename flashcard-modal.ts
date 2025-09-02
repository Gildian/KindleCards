import { App, Modal, Notice, ButtonComponent } from 'obsidian';
import { SpacedRepetitionSystem } from './spaced-repetition';
import { KindleClipping, StudyStats, IKindleCardsPlugin } from './types';
import { DebugLogger } from './logger';

export class FlashcardStudyModal extends Modal {
    private clippings: KindleClipping[];
    private currentIndex: number = 0;
    private showingAnswer: boolean = false;
    private bookTitle?: string;
    private plugin: IKindleCardsPlugin | null;
    private studyStats: StudyStats;

    // UI Elements
    private cardContent: HTMLElement;
    private progressBar: HTMLElement;
    private progressText: HTMLElement;
    private flipButton: ButtonComponent;
    private nextButton: ButtonComponent;
    private prevButton: ButtonComponent;
    private correctButton: ButtonComponent;
    private incorrectButton: ButtonComponent;
    private statsElement: HTMLElement;

    constructor(app: App, clippings: KindleClipping[], bookTitle?: string, plugin?: IKindleCardsPlugin) {
        super(app);
        this.clippings = clippings;
        this.bookTitle = bookTitle;
        this.plugin = plugin || null;
        this.studyStats = {
            total: clippings.length,
            correct: 0,
            incorrect: 0,
            remaining: clippings.length,
            reviewed: 0
        };
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.addClass('flashcard-study-modal');

        this.createHeader();
        this.createProgressSection();
        this.createCardSection();
        this.createControlButtons();
        this.createStatsSection();

        this.displayCurrentCard();
    }

    private createHeader() {
        const headerEl = this.contentEl.createEl('div', { cls: 'flashcard-header' });

        const headerContent = headerEl.createEl('div', { cls: 'flashcard-header-content' });

        // Book title if available
        if (this.bookTitle) {
            const bookTitleEl = headerContent.createEl('div', { cls: 'flashcard-book-title' });
            bookTitleEl.textContent = `Studying: ${this.bookTitle}`;
        }

        // Spaced repetition indicator
        if (this.plugin?.settings?.enableSpacedRepetition) {
            const srsIndicator = headerContent.createEl('div', { cls: 'flashcard-srs-indicator' });
            srsIndicator.createEl('span', {
                text: 'Spaced Repetition Active',
                cls: 'srs-active-badge'
            });
        }

        // Close button
        const closeButton = headerEl.createEl('button', {
            cls: 'flashcard-close-btn',
            text: '×'
        });
        closeButton.style.marginLeft = 'auto';
        closeButton.onclick = () => this.close();
    }

    private createProgressSection() {
        const progressSection = this.contentEl.createEl('div', { cls: 'flashcard-progress-section' });

        this.progressText = progressSection.createEl('div', {
            cls: 'flashcard-progress-text',
            text: this.getProgressText()
        });

        const progressContainer = progressSection.createEl('div', { cls: 'flashcard-progress-container' });
        this.progressBar = progressContainer.createEl('div', { cls: 'flashcard-progress-bar' });
        this.updateProgressBar();
    }

    private createCardSection() {
        const cardSection = this.contentEl.createEl('div', { cls: 'flashcard-card-section' });

        // Card container
        const cardContainer = cardSection.createEl('div', { cls: 'flashcard-card-container' });
        this.cardContent = cardContainer.createEl('div', { cls: 'flashcard-content' });

        // Make card clickable to flip
        cardContainer.onclick = () => this.flipCard();
    }

    private createControlButtons() {
        const controlsSection = this.contentEl.createEl('div', { cls: 'flashcard-controls' });

        // Navigation buttons
        const navButtons = controlsSection.createEl('div', { cls: 'flashcard-nav-buttons' });

        this.prevButton = new ButtonComponent(navButtons)
            .setButtonText('← Previous')
            .onClick(() => this.previousCard());

        this.flipButton = new ButtonComponent(navButtons)
            .setButtonText('Flip Card')
            .onClick(() => this.flipCard());

        this.nextButton = new ButtonComponent(navButtons)
            .setButtonText('Next →')
            .onClick(() => this.nextCard());

        // Study buttons (appear after flipping)
        const studyButtons = controlsSection.createEl('div', { cls: 'flashcard-study-buttons' });

        this.correctButton = new ButtonComponent(studyButtons)
            .setButtonText('Got it!')
            .setCta()
            .onClick(() => this.markCard('correct'));

        this.incorrectButton = new ButtonComponent(studyButtons)
            .setButtonText('Need review')
            .onClick(() => this.markCard('incorrect'));

        // Initially hide study buttons
        studyButtons.style.display = 'none';
        studyButtons.addClass('flashcard-study-buttons-hidden');
    }

    private createStatsSection() {
        this.statsElement = this.contentEl.createEl('div', { cls: 'flashcard-stats' });
        this.updateStats();
    }

    private displayCurrentCard() {
        if (this.currentIndex >= this.clippings.length) {
            this.showCompletionScreen();
            return;
        }

        const currentClipping = this.clippings[this.currentIndex];
        this.showingAnswer = false;

        // Show question side (front) – only the user's comment/notes if present
        this.cardContent.empty();
        this.cardContent.createEl('div', { cls: 'flashcard-flip-indicator', text: 'QUESTION' });

        const questionEl = this.cardContent.createEl('div', { cls: 'flashcard-question' });
        const { question, answer } = this.splitQuestionAndAnswer(currentClipping.content);
        const cleanQuestion = this.cleanQuestion(question);
        const questionText = cleanQuestion || (currentClipping.title && currentClipping.title !== 'Unknown Book'
            ? `What insight from "${currentClipping.title}" is worth remembering?`
            : 'What is this insight about?');
        questionEl.createEl('p', { text: questionText });

        // Update UI state
        this.updateControlsState();
        this.updateProgressBar();
        this.progressText.textContent = this.getProgressText();
    }

    private flipCard() {
        if (this.showingAnswer) {
            // Already showing answer, don't flip back
            return;
        }

        const currentClipping = this.clippings[this.currentIndex];
        DebugLogger.log('Displaying answer for:', currentClipping.title);
        this.showingAnswer = true;

        // Show answer side (just the quote, clean and simple)
        this.cardContent.empty();
        this.cardContent.createEl('div', { cls: 'flashcard-flip-indicator', text: 'ANSWER' });

        const answerEl = this.cardContent.createEl('div', { cls: 'flashcard-answer' });

        // Just the quote/content, nothing else
        const { answer } = this.splitQuestionAndAnswer(currentClipping.content);
        const cleanAnswer = this.cleanAnswer(answer || currentClipping.content);
        const contentEl = answerEl.createEl('div', { cls: 'flashcard-answer-content' });
        contentEl.createEl('p', { text: cleanAnswer });

        // Add page/location information if available
        if (currentClipping.location && currentClipping.location !== 'Unknown' && currentClipping.location !== 'N/A' && currentClipping.location !== '') {
            const locationEl = answerEl.createEl('div', { cls: 'flashcard-location' });
            locationEl.createEl('small', { text: `Page ${currentClipping.location}` });
        } else {
            // Fallback: show source book and author if no page number
            const sourceEl = answerEl.createEl('div', { cls: 'flashcard-location' });
            const bookInfo = `${currentClipping.title}${currentClipping.author && currentClipping.author !== 'Unknown Author' ? ' by ' + currentClipping.author : ''}`;
            sourceEl.createEl('small', { text: bookInfo });
        }

        this.updateControlsState();
    }

    // Split the raw content into question (comment/notes) and answer (quote)
    private splitQuestionAndAnswer(raw: string): { question: string; answer: string } {
        const text = (raw || '').replace(/\r/g, '');
        const answerLabel = /(\n|^)\s*\*{0,2}answer\*{0,2}\s*:?/i;
        const idx = text.search(answerLabel);
        if (idx !== -1) {
            const before = text.slice(0, idx).trim();
            // Skip the matched label and any following spaces/newlines
            const afterLabel = text.slice(idx).replace(answerLabel, '').trimStart();
            // Answer goes until another metadata label or end
            const stopLabel = /(\n|^)\s*\*{0,2}(location|page|added\s*on|date|source|tags?|type)\*{0,2}\s*:|\n\s*---\s*\n/i;
            const stopIdx = afterLabel.search(stopLabel);
            const ans = (stopIdx !== -1 ? afterLabel.slice(0, stopIdx) : afterLabel).trim();
            return { question: before, answer: ans };
        }
        // No explicit answer label; treat entire content as the answer
        return { question: '', answer: text.trim() };
    }

    // Remove metadata, headings, tags from the question side
    private cleanQuestion(text: string): string {
        if (!text) return '';

        // Aggressive cleanup similar to answer
        const cleanedText = text
            .split('\n')
            .filter(line => {
                const l = line.trim();
                if (!l) return false;

                // Remove any line with horizontal rules
                if (/^[-*_]{3,}/.test(l)) return false;

                // Remove any line containing these metadata terms (anywhere in the line)
                if (/\*\*\s*(book|author|date\s*added|added\s*on|location|page|source|tags?|type)\s*\*\*\s*:/i.test(l)) return false;
                if (/^\s*(book|author|date\s*added|added\s*on|location|page|source|tags?|type)\s*:/i.test(l)) return false;

                // Remove headers, blockquotes, lists
                if (/^#/.test(l)) return false;
                if (/^>/.test(l)) return false;
                if (/^[*\-]\s+/.test(l)) return false;
                if (/^#?flashcard\b/i.test(l)) return false;

                // Remove answer labels
                if (/^\s*(?:\*\*)?\s*answer\s*(?:\*\*)?\s*:/i.test(l)) return false;

                return true;
            })
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();

        // Second pass: remove any remaining metadata patterns and formatting
        return cleanedText
            .replace(/\*\*\s*(book|author|date\s*added|added\s*on|location|page|source|tags?|type)\s*\*\*\s*:.*?(?=\n|$)/gi, '')
            .replace(/(book|author|date\s*added|added\s*on|location|page|source|tags?|type)\s*:.*?(?=\n|$)/gi, '')
            .replace(/---+/g, '')
            .replace(/\*\*/g, '') // Remove all bold formatting
            .replace(/\s+/g, ' ')
            .trim();
    }

    // Remove labels, quotes, and metadata from the answer side
    private cleanAnswer(text: string): string {
        if (!text) return '';

        // First, aggressively remove any line that contains metadata
        const cleanedText = text
            .replace(/^\s*\"|\"\s*$/g, '') // remove surrounding quotes
            .split('\n')
            .filter(line => {
                const l = line.trim();
                if (!l) return false;

                // Remove any line with horizontal rules
                if (/^[-*_]{3,}/.test(l)) return false;

                // Remove any line containing these metadata terms (anywhere in the line)
                if (/\*\*\s*(book|author|date\s*added|added\s*on|location|page|source|tags?|type)\s*\*\*\s*:/i.test(l)) return false;
                if (/^\s*(book|author|date\s*added|added\s*on|location|page|source|tags?|type)\s*:/i.test(l)) return false;

                // Remove headers, blockquotes, lists
                if (/^#/.test(l)) return false;
                if (/^>/.test(l)) return false;
                if (/^[*\-]\s+/.test(l)) return false;
                if (/^#?flashcard\b/i.test(l)) return false;

                // Remove answer labels
                if (/^\s*(?:\*\*)?\s*answer\s*(?:\*\*)?\s*:/i.test(l)) return false;

                return true;
            })
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();

        // Second pass: remove any remaining metadata patterns and formatting
        return cleanedText
            .replace(/\*\*\s*(book|author|date\s*added|added\s*on|location|page|source|tags?|type)\s*\*\*\s*:.*?(?=\n|$)/gi, '')
            .replace(/(book|author|date\s*added|added\s*on|location|page|source|tags?|type)\s*:.*?(?=\n|$)/gi, '')
            .replace(/---+/g, '')
            .replace(/\*\*/g, '') // Remove all bold formatting
            .replace(/\s+/g, ' ')
            .trim();
    }

    private nextCard() {
        if (this.currentIndex < this.clippings.length - 1) {
            this.currentIndex++;
            this.displayCurrentCard();
        } else if (this.currentIndex === this.clippings.length - 1) {
            // On last card, show completion screen
            this.showCompletionScreen();
        }
    }

    private previousCard() {
        if (this.currentIndex > 0) {
            this.currentIndex--;
            this.displayCurrentCard();
        }
    }

    private markCard(result: 'correct' | 'incorrect') {
        if (!this.showingAnswer) {
            new Notice('Flip the card first to see the answer!');
            return;
        }

        // Prevent multiple clicks by immediately disabling buttons
        this.correctButton.setDisabled(true);
        this.incorrectButton.setDisabled(true);

        const currentClipping = this.clippings[this.currentIndex];

        // Update traditional stats
        if (result === 'correct') {
            this.studyStats.correct++;
        } else {
            this.studyStats.incorrect++;
        }

        this.studyStats.remaining--;
        this.studyStats.reviewed++;

        // Handle spaced repetition if enabled
        if (this.plugin?.settings?.enableSpacedRepetition && this.plugin.spacedRepetition) {
            try {
                // Generate card ID
                const cardId = SpacedRepetitionSystem.generateCardId(
                    currentClipping.title,
                    currentClipping.author,
                    currentClipping.content
                );

                // Map result to quality score (0-5 scale for SM-2 algorithm)
                const quality = result === 'correct' ? 4 : 1; // 4 = good, 1 = hard

                // Review the card with proper ReviewResult format
                this.plugin.spacedRepetition.reviewCard(cardId, { quality });

                // Save the updated spaced repetition data
                this.plugin.saveSettings().catch((error: Error) => {
                    console.error('Failed to save spaced repetition data:', error);
                });

            } catch (error) {
                console.error('Error updating spaced repetition data:', error);
            }
        }

        this.updateStats();

        // Auto-advance to next card after a short delay
        if (this.currentIndex < this.clippings.length - 1) {
            setTimeout(() => {
                this.currentIndex++;
                this.displayCurrentCard();
            }, 300);
        } else {
            // Last card - show completion after delay
            setTimeout(() => {
                this.showCompletionScreen();
            }, 300);
        }
    }

    private updateControlsState() {
        // Update navigation buttons - disable prev on first card, next on last card
        this.prevButton.setDisabled(this.currentIndex === 0);
        this.nextButton.setDisabled(this.currentIndex >= this.clippings.length - 1);

        // Update flip button
        if (this.showingAnswer) {
            this.flipButton.setButtonText('Flipped');
            this.flipButton.setDisabled(true);
        } else {
            this.flipButton.setButtonText('Flip Card');
            this.flipButton.setDisabled(false);
        }

        // Show/hide study buttons based on whether answer is showing
        const studyButtons = this.contentEl.querySelector('.flashcard-study-buttons') as HTMLElement;
        if (studyButtons) {
            if (this.showingAnswer) {
                studyButtons.style.display = 'flex';
                studyButtons.removeClass('flashcard-study-buttons-hidden');
                // Re-enable buttons when showing answer (in case they were disabled)
                this.correctButton.setDisabled(false);
                this.incorrectButton.setDisabled(false);
            } else {
                studyButtons.style.display = 'none';
                studyButtons.addClass('flashcard-study-buttons-hidden');
            }
        }
    }

    private updateProgressBar() {
        const progress = ((this.currentIndex + 1) / this.clippings.length) * 100;
        this.progressBar.style.width = `${progress}%`;
    }

    private getProgressText(): string {
        return `Card ${this.currentIndex + 1} of ${this.clippings.length}`;
    }

    private updateStats() {
        this.statsElement.empty();

        const stats = [
            { label: 'Total', value: this.studyStats.total, class: 'total' },
            { label: 'Correct', value: this.studyStats.correct, class: 'correct' },
            { label: 'Need Review', value: this.studyStats.incorrect, class: 'incorrect' },
            { label: 'Remaining', value: this.studyStats.remaining, class: 'remaining' }
        ];

        // Add spaced repetition stats if enabled
        if (this.plugin?.settings?.enableSpacedRepetition && this.studyStats.reviewed > 0) {
            stats.push({
                label: 'Reviewed',
                value: this.studyStats.reviewed,
                class: 'reviewed'
            });
        }

        stats.forEach(stat => {
            const statEl = this.statsElement.createEl('div', { cls: `flashcard-stat flashcard-stat-${stat.class}` });
            statEl.createEl('div', { cls: 'stat-value', text: stat.value.toString() });
            statEl.createEl('div', { cls: 'stat-label', text: stat.label });
        });
    }

    private showCompletionScreen() {
        this.contentEl.empty();

        const completionEl = this.contentEl.createEl('div', { cls: 'flashcard-completion' });
        completionEl.createEl('h2', { text: 'Study Session Complete!' });

        const resultsEl = completionEl.createEl('div', { cls: 'flashcard-results' });

        const totalAnswered = this.studyStats.correct + this.studyStats.incorrect;
        const accuracy = totalAnswered > 0
            ? Math.round((this.studyStats.correct / totalAnswered) * 100)
            : 0;

        resultsEl.createEl('p', { text: `You studied ${this.studyStats.total} flashcards` });
        resultsEl.createEl('p', { text: `Accuracy: ${accuracy}% (${this.studyStats.correct} correct, ${this.studyStats.incorrect} need review)` });

        // Add spaced repetition summary if enabled
        if (this.plugin?.settings?.enableSpacedRepetition && this.studyStats.reviewed > 0) {
            resultsEl.createEl('p', {
                text: `Spaced Repetition: ${this.studyStats.reviewed} cards reviewed and rescheduled`,
                cls: 'srs-completion-info'
            });
        }

        const actionsEl = completionEl.createEl('div', { cls: 'flashcard-completion-actions' });

        new ButtonComponent(actionsEl)
            .setButtonText('Study Again')
            .setCta()
            .onClick(() => {
                // Reset all state
                this.currentIndex = 0;
                this.showingAnswer = false;
                this.studyStats = {
                    total: this.clippings.length,
                    correct: 0,
                    incorrect: 0,
                    remaining: this.clippings.length,
                    reviewed: 0
                };

                // Recreate the UI from scratch (preserving bookTitle)
                this.contentEl.empty();
                this.createHeader();
                this.createProgressSection();
                this.createCardSection();
                this.createControlButtons();
                this.createStatsSection();

                // Display the first card
                this.displayCurrentCard();
            });

        new ButtonComponent(actionsEl)
            .setButtonText('Close')
            .onClick(() => this.close());
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
