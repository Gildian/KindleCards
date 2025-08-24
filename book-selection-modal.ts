import { App, Modal, ButtonComponent, Notice } from 'obsidian';
import { KindleClipping } from './main';
import { FlashcardStudyModal } from './flashcard-modal';

export interface BookGroup {
    title: string;
    author: string;
    flashcards: KindleClipping[];
    count: number;
}

export class BookSelectionModal extends Modal {
    private bookGroups: BookGroup[];
    private originalClippings: KindleClipping[];

    constructor(app: App, clippings: KindleClipping[]) {
        super(app);
        this.originalClippings = clippings;
        this.bookGroups = this.groupFlashcardsByBook(clippings);
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.addClass('book-selection-modal');

        this.createHeader();
        this.createBookList();
        this.createFooterActions();
    }

    private createHeader() {
        const headerEl = this.contentEl.createEl('div', { cls: 'book-selection-header' });

        headerEl.createEl('h2', { text: '📚 Select Books to Study' });
        headerEl.createEl('p', {
            text: `Found ${this.originalClippings.length} flashcards from ${this.bookGroups.length} books`,
            cls: 'book-selection-subtitle'
        });

        // Close button
        const closeButton = headerEl.createEl('button', {
            cls: 'book-selection-close-btn',
            text: '×'
        });
        closeButton.onclick = () => this.close();
    }

    private createBookList() {
        const listContainer = this.contentEl.createEl('div', { cls: 'book-list-container' });

        // Sort books by flashcard count (most first) then alphabetically
        const sortedBooks = [...this.bookGroups].sort((a, b) => {
            if (b.count !== a.count) {
                return b.count - a.count;
            }
            return a.title.localeCompare(b.title);
        });

        sortedBooks.forEach(book => {
            const bookItem = listContainer.createEl('div', { cls: 'book-item' });

            const bookInfo = bookItem.createEl('div', { cls: 'book-info' });

            const titleEl = bookInfo.createEl('div', { cls: 'book-title' });
            titleEl.textContent = book.title || 'Unknown Book';

            const authorEl = bookInfo.createEl('div', { cls: 'book-author' });
            
            console.log('Displaying book:', book.title, 'with author:', book.author);
            
            // Show author if it exists and isn't one of the "unknown" variants
            if (book.author && 
                book.author.trim() && 
                book.author !== 'Unknown Author' && 
                book.author.toLowerCase() !== 'unknown' &&
                book.author.toLowerCase() !== 'unknown author') {
                authorEl.textContent = `by ${book.author}`;
                console.log('Showing author:', book.author);
            } else {
                // For truly unknown authors, just leave it blank
                authorEl.textContent = '';
                authorEl.style.display = 'none';
                console.log('Hiding author for:', book.title, 'author was:', book.author);
            }

            const countEl = bookInfo.createEl('div', { cls: 'book-count' });
            countEl.textContent = `${book.count} flashcard${book.count === 1 ? '' : 's'}`;

            const studyButton = new ButtonComponent(bookItem)
                .setButtonText('Study')
                .setCta()
                .onClick(() => {
                    this.close();
                    this.startStudySession(book.flashcards, book.title);
                });
        });
    }

    private createFooterActions() {
        const footerEl = this.contentEl.createEl('div', { cls: 'book-selection-footer' });

        new ButtonComponent(footerEl)
            .setButtonText('Study All Books')
            .setWarning()
            .onClick(() => {
                this.close();
                this.startStudySession(this.originalClippings, 'All Books');
            });

        new ButtonComponent(footerEl)
            .setButtonText('Cancel')
            .onClick(() => this.close());
    }

    private groupFlashcardsByBook(clippings: KindleClipping[]): BookGroup[] {
        const bookMap = new Map<string, BookGroup>();

        clippings.forEach(clipping => {
            // Debug logging
            console.log('Processing clipping:', {
                title: clipping.title,
                author: clipping.author,
                authorType: typeof clipping.author,
                authorLength: clipping.author?.length
            });
            
            const bookKey = this.getBookKey(clipping);
            
            if (!bookMap.has(bookKey)) {
                // Clean up the author field, but preserve valid authors
                let cleanAuthor = (clipping.author || '').trim();
                
                console.log('Original author:', clipping.author);
                console.log('Clean author before filtering:', cleanAuthor);
                
                // Only clear if it's explicitly unknown
                if (cleanAuthor === 'Unknown' || 
                    cleanAuthor === 'Unknown Author' || 
                    cleanAuthor.toLowerCase() === 'unknown author' ||
                    cleanAuthor.toLowerCase() === 'unknown') {
                    cleanAuthor = '';
                    console.log('Cleared unknown author');
                } else {
                    console.log('Keeping author:', cleanAuthor);
                }
                
                bookMap.set(bookKey, {
                    title: (clipping.title || 'Unknown Book').trim(),
                    author: cleanAuthor,
                    flashcards: [],
                    count: 0
                });
            }

            const bookGroup = bookMap.get(bookKey)!;
            bookGroup.flashcards.push(clipping);
            bookGroup.count = bookGroup.flashcards.length;
        });

        const result = Array.from(bookMap.values());
        console.log('Final book groups:', result);
        return result;
    }    private getBookKey(clipping: KindleClipping): string {
        // Create a unique key for each book based on title and author
        const title = (clipping.title || 'Unknown Book').toLowerCase().trim();
        let author = (clipping.author || '').toLowerCase().trim();
        
        // Normalize unknown author variations
        if (!author || 
            author === 'unknown' || 
            author === 'unknown author' || 
            author === 'author unknown') {
            author = '';
        }
        
        return `${title}|||${author}`;
    }

    private startStudySession(clippings: KindleClipping[], bookTitle: string) {
        if (clippings.length === 0) {
            new Notice('No flashcards found to study.');
            return;
        }

        // Shuffle the cards for better studying
        const shuffledClippings = this.shuffleArray([...clippings]);

        // Open the study modal with book context
        const studyModal = new FlashcardStudyModal(this.app, shuffledClippings, bookTitle);
        studyModal.open();
    }

    private shuffleArray<T>(array: T[]): T[] {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
