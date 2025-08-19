import { App, Modal, Notice, ButtonComponent } from 'obsidian';
import { KindleClipping } from './main';

export class FlashcardStudyModal extends Modal {
    private clippings: KindleClipping[];
    private currentIndex: number = 0;
    private showingAnswer: boolean = false;
    private studyStats: {
        total: number;
        correct: number;
        incorrect: number;
        remaining: number;
    };

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

    constructor(app: App, clippings: KindleClipping[]) {
        super(app);
        this.clippings = clippings;
        this.studyStats = {
            total: clippings.length,
            correct: 0,
            incorrect: 0,
            remaining: clippings.length
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
        headerEl.createEl('h2', { text: 'Kindle Flashcard Study Session' });

        // Close button
        const closeButton = headerEl.createEl('button', {
            cls: 'flashcard-close-btn',
            text: '×'
        });
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
            .setButtonText('✓ Got it!')
            .setCta()
            .onClick(() => this.markCard('correct'));

        this.incorrectButton = new ButtonComponent(studyButtons)
            .setButtonText('✗ Need review')
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

        // Show question side (create a proper question)
        this.cardContent.empty();
        this.cardContent.createEl('div', { cls: 'flashcard-flip-indicator', text: 'QUESTION' });

        const questionEl = this.cardContent.createEl('div', { cls: 'flashcard-question' });

        // Create a proper question from the highlight
        const questionText = `What insight is highlighted in "${currentClipping.title}"?`;
        questionEl.createEl('p', { text: questionText });

        const hintEl = this.cardContent.createEl('div', { cls: 'flashcard-hint' });
        hintEl.createEl('em', { text: `Page ${currentClipping.location}` });

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
        this.showingAnswer = true;

        // Show answer side (the actual highlight/content)
        this.cardContent.empty();
        this.cardContent.createEl('div', { cls: 'flashcard-flip-indicator', text: 'ANSWER' });

        const answerEl = this.cardContent.createEl('div', { cls: 'flashcard-answer' });

        // The actual highlighted content/quote
        const contentEl = answerEl.createEl('div', { cls: 'flashcard-answer-content' });
        contentEl.createEl('p', { text: `"${currentClipping.content}"` });

        // Simple metadata - show book title, author (if available), and page
        const metadataEl = answerEl.createEl('div', { cls: 'flashcard-metadata' });
        metadataEl.createEl('strong', { text: currentClipping.title });
        if (currentClipping.author && currentClipping.author !== 'Unknown') {
            metadataEl.createEl('br');
            metadataEl.createEl('span', { text: `by ${currentClipping.author}` });
        }
        metadataEl.createEl('br');
        metadataEl.createEl('small', { text: `Page: ${currentClipping.location}` });

        this.updateControlsState();
    }

    private nextCard() {
        if (this.currentIndex < this.clippings.length - 1) {
            this.currentIndex++;
            this.displayCurrentCard();
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

        if (result === 'correct') {
            this.studyStats.correct++;
        } else {
            this.studyStats.incorrect++;
        }

        this.studyStats.remaining--;
        this.updateStats();

        // Auto-advance to next card
        setTimeout(() => {
            this.nextCard();
        }, 500);
    }

    private updateControlsState() {
        // Update navigation buttons
        this.prevButton.setDisabled(this.currentIndex === 0);
        this.nextButton.setDisabled(this.currentIndex === this.clippings.length - 1);

        // Update flip button
        this.flipButton.setButtonText(this.showingAnswer ? 'Card Flipped' : 'Flip Card');
        this.flipButton.setDisabled(this.showingAnswer);

        // Show/hide study buttons
        const studyButtons = this.contentEl.querySelector('.flashcard-study-buttons') as HTMLElement;
        if (studyButtons) {
            if (this.showingAnswer) {
                studyButtons.style.display = 'flex';
                studyButtons.removeClass('flashcard-study-buttons-hidden');
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

        stats.forEach(stat => {
            const statEl = this.statsElement.createEl('div', { cls: `flashcard-stat flashcard-stat-${stat.class}` });
            statEl.createEl('div', { cls: 'stat-value', text: stat.value.toString() });
            statEl.createEl('div', { cls: 'stat-label', text: stat.label });
        });
    }

    private showCompletionScreen() {
        this.contentEl.empty();

        const completionEl = this.contentEl.createEl('div', { cls: 'flashcard-completion' });
        completionEl.createEl('h2', { text: '🎉 Study Session Complete!' });

        const resultsEl = completionEl.createEl('div', { cls: 'flashcard-results' });

        const totalAnswered = this.studyStats.correct + this.studyStats.incorrect;
        const accuracy = totalAnswered > 0
            ? Math.round((this.studyStats.correct / totalAnswered) * 100)
            : 0;

        resultsEl.createEl('p', { text: `You studied ${this.studyStats.total} flashcards` });
        resultsEl.createEl('p', { text: `Accuracy: ${accuracy}% (${this.studyStats.correct} correct, ${this.studyStats.incorrect} need review)` });

        const actionsEl = completionEl.createEl('div', { cls: 'flashcard-completion-actions' });

        new ButtonComponent(actionsEl)
            .setButtonText('Study Again')
            .setCta()
            .onClick(() => {
                this.currentIndex = 0;
                this.studyStats = {
                    total: this.clippings.length,
                    correct: 0,
                    incorrect: 0,
                    remaining: this.clippings.length
                };
                this.onOpen();
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
