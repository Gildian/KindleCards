import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile, TFolder, TextComponent } from 'obsidian';
import { KindleParser } from './kindle-parser';
import { FlashcardGenerator } from './flashcard-generator';
import { FlashcardStudyModal } from './flashcard-modal';
import { BookSelectionModal } from './book-selection-modal';
import { SpacedRepetitionSystem } from './spaced-repetition';
import { KindleClipping, KindleCardsSettings, CardReviewData } from './types';
import { DebugLogger } from './logger';

const DEFAULT_SETTINGS: KindleCardsSettings = {
	kindlePath: '',
	outputFolder: 'KindleCards',
	cardTemplate: '{{content}}\n\n**Source:** {{title}} by {{author}} - Page {{location}}',
	spacedRepetitionData: {},
	enableSpacedRepetition: true,
	newCardsPerDay: 20,
	
	// Anki-like SRS Settings (matching Anki defaults)
	learningSteps: [1, 10], // 1 minute, 10 minutes
	relearningSteps: [10], // 10 minutes
	graduatingInterval: 1, // 1 day
	easyInterval: 4, // 4 days
	startingEase: 2.5, // 250%
	easyBonus: 1.3, // 130%
	intervalModifier: 1.0, // 100%
	maximumInterval: 36500, // 100 years (effectively unlimited)
	hardInterval: 1.2, // 120%
	newInterval: 0.0, // 0% (reset to learning)
	minimumInterval: 1, // 1 day
	leechThreshold: 8, // 8 lapses
	maximumReviewsPerDay: 200,
	
	// Study Experience Settings
	enableCardFlipAnimation: true,
	showProgressStats: true,
	enableKeyboardShortcuts: true,
	autoShowAnswer: false,
	autoShowAnswerDelay: 5,
	enableFullscreenStudy: true,
	showTimerDuringStudy: false,
	enableSoundEffects: false,
	
	// Content Processing Settings
	includeHighlightedText: true,
	includeBookNotes: true,
	includeLocationInfo: true,
	minimumContentLength: 10,
	maximumContentLength: 1000,
	excludePatterns: [],
	includeOnlyPatterns: [],
	
	// File Organization Settings
	groupCardsByBook: true,
	useBookAuthorFolders: false,
	generateTOC: false,
	includeMetadataFiles: false,
	cardFileNamingFormat: '{{title}} - {{location}}',
	enableAutoSync: false,
	backupBeforeSync: true,
	
	// UI/UX Preferences
	preferredTheme: 'auto',
	compactMode: false,
	showBookCovers: false,
	enableBulkOperations: true,
	confirmDeletions: true,
	showAdvancedStats: true,
	
	// Performance Settings
	maxCardsInMemory: 1000,
	enableBackgroundSync: false,
	cacheBookData: true,
	enableDebugLogging: false,
	
	// Export/Import Settings
	exportIncludeStats: true,
	exportFormat: 'json',
	enableAutoExport: false,
	autoExportInterval: 24
};

export default class KindleCardsPlugin extends Plugin {
	settings: KindleCardsSettings;
	spacedRepetition: SpacedRepetitionSystem;

	async onload() {
		await this.loadSettings();

		// Initialize debug logging (can be enabled via console: DebugLogger.enableDebug())
		DebugLogger.log('KindleCards plugin loaded');

		// Initialize spaced repetition system
		try {
			this.spacedRepetition = new SpacedRepetitionSystem(this.settings.spacedRepetitionData, this.settings);
		} catch (error) {
			console.error('Failed to initialize spaced repetition system:', error);
			// Initialize with empty data if there's an error
			this.spacedRepetition = new SpacedRepetitionSystem({}, this.settings);
		}

		// This creates a single icon in the left ribbon for both sync and study
		const ribbonIconEl = this.addRibbonIcon('book-open', 'KindleCards', (evt: MouseEvent) => {
			// Open the main KindleCards interface
			this.openKindleCardsInterface();
		});

		// Add GitHub integration ribbon icon
		this.addRibbonIcon('git-branch', 'Quick Commit to GitHub', (evt: MouseEvent) => {
			this.quickCommitToGitHub();
		});

		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		const statusBarItemEl = this.addStatusBarItem();
		statusBarItemEl.setText('KindleCards Ready');

		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: 'sync-kindle-clippings',
			name: 'Sync Kindle Clippings',
			callback: () => {
				this.syncKindleClippings();
			}
		});

		// Add study session command
		this.addCommand({
			id: 'start-study-session',
			name: 'Start Flashcard Study Session',
			callback: () => {
				this.startStudySession();
			}
		});

		// Add study current folder command
		this.addCommand({
			id: 'study-current-folder',
			name: 'Study Flashcards in Current Folder',
			callback: () => {
				this.studyCurrentFolder();
			}
		});

		// This adds an editor command that can perform some operation on the current editor instance
		this.addCommand({
			id: 'create-flashcard-from-selection',
			name: 'Create flashcard from selection',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				const selection = editor.getSelection();
				if (selection) {
					this.createFlashcardFromText(selection);
				} else {
					new Notice('Please select text to create a flashcard');
				}
			}
		});

		// Open main modal command
		this.addCommand({
			id: 'open-kindle-cards-main',
			name: 'Open KindleCards Main Menu',
			callback: () => {
				this.openMainInterface();
			}
		});

		// Debug command for spaced repetition
		this.addCommand({
			id: 'debug-spaced-repetition',
			name: 'Debug Spaced Repetition System',
			callback: () => {
				DebugLogger.enableDebug();
				this.spacedRepetition.debugInfo();
				new Notice('Spaced repetition debug info logged to console (F12)');
			}
		});

		// GitHub integration
		this.addCommand({
			id: 'commit-to-github',
			name: 'Quick Commit to GitHub',
			callback: () => {
				this.quickCommitToGitHub();
			}
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new KindleCardsSettingTab(this.app, this));
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		DebugLogger.log(`Loaded settings with ${Object.keys(this.settings.spacedRepetitionData || {}).length} saved card records`);
	}

	async saveSettings() {
		// Save spaced repetition data
		if (this.spacedRepetition) {
			this.settings.spacedRepetitionData = this.spacedRepetition.exportData();
			DebugLogger.log(`Saving ${Object.keys(this.settings.spacedRepetitionData).length} card records to disk`);
		}
		await this.saveData(this.settings);
		// Update the spaced repetition system with new settings
		if (this.spacedRepetition) {
			this.spacedRepetition.updateSettings(this.settings);
		}
	}

	openKindleCardsInterface() {
		new KindleCardsMainModal(this.app, this).open();
	}

	async syncKindleClippings() {
		try {
			new Notice('Starting Kindle sync...');

			// Check if Kindle path is set
			if (!this.settings.kindlePath) {
				new Notice('Please set your Kindle path in settings');
				return;
			}

			// Read the My Clippings.txt file
			const clippingsContent = await this.readKindleClippings();
			if (!clippingsContent) {
				new Notice('Could not read My Clippings.txt file');
				return;
			}

			// Parse the clippings
			const validation = KindleParser.validateClippingsFile(clippingsContent);
			if (!validation.valid) {
				new Notice(`Error: ${validation.message}`);
				return;
			}

			const clippings = KindleParser.parseClippings(clippingsContent);

			// Create flashcards
			await this.createFlashcardsFromClippings(clippings);

			new Notice(`Created ${clippings.length} flashcards from Kindle highlights`);
		} catch (error) {
			console.error('Error syncing Kindle clippings:', error);
			new Notice('Error syncing Kindle clippings. Check console for details.');
		}
	}

	async readKindleClippings(): Promise<string | null> {
		try {
			// Use file picker approach with better debugging
			const input = document.createElement('input');
			input.type = 'file';
			input.accept = '.txt';

			return new Promise((resolve) => {
				input.onchange = (e) => {
					const file = (e.target as HTMLInputElement).files?.[0];
					if (file) {
						DebugLogger.log('Selected file:', file.name, 'Size:', file.size);
						const reader = new FileReader();
						reader.onload = (e) => {
							const content = e.target?.result as string;
							DebugLogger.log('File content length:', content?.length);
							resolve(content);
						};
						reader.onerror = (e) => {
							DebugLogger.error('Error reading file:', e);
							resolve(null);
						};
						reader.readAsText(file);
					} else {
						DebugLogger.log('No file selected');
						resolve(null);
					}
				};
				input.click();
			});
		} catch (error) {
			console.error('Error reading Kindle clippings:', error);
			return null;
		}
	}

	async createFlashcardsFromClippings(clippings: KindleClipping[]) {
		// Ensure output folder exists
		const outputFolder = this.settings.outputFolder;
		await this.ensureFolderExists(outputFolder);

		for (const clipping of clippings) {
			await this.createFlashcardFromClipping(clipping);
		}
	}

	async createFlashcardFromClipping(clipping: KindleClipping) {
		// Create simple filename from title and location
		const fileName = FlashcardGenerator.sanitizeFileName(`${clipping.title} - ${clipping.location}`) + '.md';
		const filePath = `${this.settings.outputFolder}/${fileName}`;

		// Create flashcard content with simple template
		const flashcardContent = FlashcardGenerator.generateFlashcard(clipping, this.settings.cardTemplate);

		// Check if file already exists
		const existingFile = this.app.vault.getAbstractFileByPath(filePath);
		if (existingFile) {
			// File exists, could implement update logic here
			return;
		}

		// Create new file
		await this.app.vault.create(filePath, flashcardContent);
	}

	async createFlashcardFromText(text: string) {
		const fileName = FlashcardGenerator.sanitizeFileName(`Flashcard - ${new Date().toISOString().split('T')[0]}`) + '.md';
		const filePath = `${this.settings.outputFolder}/${fileName}`;

		const flashcardContent = FlashcardGenerator.generateFlashcard({
			title: 'Custom Flashcard',
			author: 'User Created',
			type: 'Note',
			location: 'N/A',
			date: new Date().toLocaleString(),
			content: text
		}, this.settings.cardTemplate);

		try {
			await this.ensureFolderExists(this.settings.outputFolder);
			await this.app.vault.create(filePath, flashcardContent);
			new Notice('Flashcard created!');
		} catch (error) {
			console.error('Error creating flashcard:', error);
			new Notice('Error creating flashcard. Check console for details.');
		}
	}

	async ensureFolderExists(folderPath: string) {
		const folder = this.app.vault.getAbstractFileByPath(folderPath);
		if (!folder) {
			await this.app.vault.createFolder(folderPath);
		}
	}

	async startStudySession(): Promise<void> {
		try {
			// Get all flashcards from the output folder
			const clippings = await this.loadFlashcardsFromFolder(this.settings.outputFolder);

			if (clippings.length === 0) {
				new Notice('No flashcards found! Sync your Kindle highlights first.');
				return;
			}

			// Apply spaced repetition sorting if enabled
			const sortedClippings = this.applySRSSorting(clippings);

			// Open the book selection modal with sorted clippings
			const bookSelectionModal = new BookSelectionModal(this.app, sortedClippings, this);
			bookSelectionModal.open();

		} catch (error) {
			console.error('Error starting study session:', error);
			new Notice('Error starting study session. Check console for details.');
		}
	}

	/**
	 * Apply spaced repetition sorting to clippings if enabled
	 */
	private applySRSSorting(clippings: KindleClipping[]): KindleClipping[] {
		if (!this.settings.enableSpacedRepetition || !this.spacedRepetition) {
			return this.shuffleArray([...clippings]);
		}

		try {
			// Generate card IDs for all clippings
			const cardIds = clippings.map(clipping => {
				try {
					return SpacedRepetitionSystem.generateCardId(clipping.title, clipping.author, clipping.content);
				} catch (error) {
					console.warn('Failed to generate card ID for clipping:', clipping.title, error);
					return null;
				}
			}).filter((id): id is string => id !== null);

			if (cardIds.length === 0) {
				new Notice('Warning: Could not process clippings for spaced repetition. Using random order.');
				return this.shuffleArray([...clippings]);
			}

			// Get sorted card IDs based on spaced repetition priority
			const studyCardIds = this.spacedRepetition.getStudyCards(cardIds);
			const sortedIds = this.spacedRepetition.getSortedCards(studyCardIds);

			// Create mapping for reordering
			const clippingMap = new Map<string, KindleClipping>();
			clippings.forEach((clipping, index) => {
				if (index < cardIds.length && cardIds[index]) {
					clippingMap.set(cardIds[index], clipping);
				}
			});

			// Reorder clippings based on sorted IDs
			const sortedClippings = sortedIds
				.map(id => clippingMap.get(id))
				.filter((clipping): clipping is KindleClipping => clipping !== undefined);

			// Show stats
			const stats = this.spacedRepetition.getStats(studyCardIds);
			new Notice(`Study Session: ${stats.due} due, ${stats.new} new, ${stats.learning} learning`);

			return sortedClippings;

		} catch (error) {
			console.error('Error applying SRS sorting:', error);
			new Notice('Warning: Spaced repetition sorting failed. Using random order.');
			return this.shuffleArray([...clippings]);
		}
	}

	openMainInterface() {
		new Notice('KindleCards Main Menu - Feature coming soon! Use commands for now.');
	}

	async quickCommitToGitHub() {
		try {
			// Check if we're in a git repository
			const checkGitResult = await this.runGitCommand('git status --porcelain');

			if (checkGitResult.includes('not a git repository')) {
				new Notice('❌ Not in a git repository. Initialize git first.');
				return;
			}

			// Check for changes
			if (checkGitResult.trim() === '') {
				new Notice('✅ No changes to commit. Working directory is clean.');
				return;
			}

			// Show changes and ask for commit message
			const changes = checkGitResult.split('\n').filter(line => line.trim()).length;
			const commitMessage = await this.promptForCommitMessage(changes);

			if (!commitMessage) {
				new Notice('Commit cancelled.');
				return;
			}

			// Add all changes
			new Notice('📝 Adding changes...');
			await this.runGitCommand('git add .');

			// Commit with message
			new Notice('💾 Committing changes...');
			await this.runGitCommand(`git commit -m "${commitMessage}"`);

			// Push to origin
			new Notice('🚀 Pushing to GitHub...');
			const pushResult = await this.runGitCommand('git push origin main');

			if (pushResult.includes('error') || pushResult.includes('fatal')) {
				new Notice('❌ Push failed. Check console for details.');
				console.error('Git push error:', pushResult);
			} else {
				new Notice('✅ Successfully pushed to GitHub!');
				DebugLogger.log('GitHub push successful:', pushResult);
			}

		} catch (error) {
			console.error('Error with GitHub commit:', error);
			new Notice('❌ Error committing to GitHub. Check console for details.');
		}
	}

	private async promptForCommitMessage(changedFiles: number): Promise<string | null> {
		return new Promise((resolve) => {
			const modal = new CommitMessageModal(this.app, changedFiles, (message: string | null) => {
				resolve(message);
			});
			modal.open();
		});
	}

	private async runGitCommand(command: string): Promise<string> {
		const { exec } = require('child_process');
		const { promisify } = require('util');
		const execAsync = promisify(exec);

		try {
			const workspaceFolder = (this.app.vault.adapter as any).path;
			const { stdout, stderr } = await execAsync(command, {
				cwd: workspaceFolder,
				timeout: 30000 // 30 second timeout
			});

			return stdout + stderr;
		} catch (error) {
			return error.message || 'Command failed';
		}
	}

	async studyCurrentFolder() {
		try {
			const activeFile = this.app.workspace.getActiveFile();
			if (!activeFile) {
				new Notice('No active file. Please open a file in the folder you want to study.');
				return;
			}

			const folderPath = activeFile.parent?.path || '';
			const clippings = await this.loadFlashcardsFromFolder(folderPath);

			if (clippings.length === 0) {
				new Notice('No flashcards found in current folder.');
				return;
			}

			// Open the book selection modal for the current folder
			const bookSelectionModal = new BookSelectionModal(this.app, clippings, this);
			bookSelectionModal.open();

		} catch (error) {
			console.error('Error studying current folder:', error);
			new Notice('Error studying current folder. Check console for details.');
		}
	}

	private async loadFlashcardsFromFolder(folderPath: string): Promise<KindleClipping[]> {
		const clippings: KindleClipping[] = [];
		const folder = this.app.vault.getAbstractFileByPath(folderPath);

		if (!folder || !(folder instanceof TFolder)) {
			return clippings;
		}

		for (const child of folder.children) {
			if (child instanceof TFile && child.extension === 'md') {
				const clipping = await this.parseFlashcardFile(child);
				if (clipping) {
					clippings.push(clipping);
				}
			}
		}

		return clippings;
	}

	private async parseFlashcardFile(file: TFile): Promise<KindleClipping | null> {
		try {
			const content = await this.app.vault.read(file);

			// Initialize with defaults
			let title = 'Unknown Book';
			let author = 'Unknown Author';
			let location = 'Unknown';
			let date = new Date().toLocaleDateString();
			let type = 'Highlight';
			let mainContent = '';

			// Split into lines and process
			const lines = content.split('\n');
			const sourceLineIndex = lines.findIndex(line => line.trim().startsWith('**Source:**'));

			if (sourceLineIndex !== -1) {
				// Extract content (everything before the **Source:** line)
				mainContent = lines.slice(0, sourceLineIndex)
					.join('\n')
					.trim();

				// Also try to extract author from embedded metadata in content
				const contentAuthorMatch = content.match(/\*\*Author:\*\*\s*([^\n\*]+)/i);
				const contentBookMatch = content.match(/\*\*Book:\*\*\s*([^\n\*]+)/i);
				const contentLocationMatch = content.match(/\*\*(?:Location|Page):\*\*\s*([^\n\*]+)/i) ||
											 content.match(/(?:Location|Page)\s*(\d+(?:-\d+)?)/i);

				// Strip common labels/metadata from the front text
				mainContent = mainContent
					.split('\n')
					.filter(line => {
						const l = line.trim();
						if (!l) return false;
						if (/^#/.test(l)) return false; // headers
						if (/^#?flashcard\b/i.test(l)) return false; // tags
						if (/^\*{0,2}(answer|location|page|added\s*on|date|source|tags?|type|book|author)\*{0,2}\s*:/i.test(l)) return false;
						if (/---/.test(l)) return false; // separator lines
						return true;
					})
					.join(' ')
					.replace(/\s+/g, ' ')
					.replace(/^\"|\"$/g, '')
					.trim();

				// Parse the source line
				const sourceLine = lines[sourceLineIndex].trim();
				DebugLogger.log('Parsing source line:', sourceLine);

				// Pattern: **Source:** Title by Author - Page Location
				const fullMatch = sourceLine.match(/\*\*Source:\*\*\s*(.+?)\s+by\s+(.+?)\s*-\s*Page\s*(.+)/);
				if (fullMatch) {
					title = fullMatch[1].trim();
					author = fullMatch[2].trim();
					location = fullMatch[3].trim();
				} else {
					// Pattern: **Source:** Title - Page Location (no author)
					const simpleMatch = sourceLine.match(/\*\*Source:\*\*\s*(.+?)\s*-\s*Page\s*(.+)/);
					if (simpleMatch) {
						title = simpleMatch[1].trim();
						location = simpleMatch[2].trim();
						// Try to extract author from title if format is "Title (Author)"
						const titleAuthorMatch = title.match(/^(.+?)\s*\((.+?)\)$/);
						if (titleAuthorMatch) {
							title = titleAuthorMatch[1].trim();
							author = titleAuthorMatch[2].trim();
						}
					} else {
						// Just get everything after **Source:**
						const basicMatch = sourceLine.match(/\*\*Source:\*\*\s*(.+)/);
						if (basicMatch) {
							title = basicMatch[1].trim();
						}
					}
				}

				// Override with embedded metadata if found
				if (contentAuthorMatch) {
					author = contentAuthorMatch[1].trim();
				}
				if (contentBookMatch) {
					title = contentBookMatch[1].trim();
				}
				if (contentLocationMatch) {
					location = contentLocationMatch[1].trim();
				}
			} else {
				// No source line found, use entire content and try to extract metadata from it
				const fullContent = content;

				// Try to extract author from embedded **Author:** pattern in content
				const authorMatch = fullContent.match(/\*\*Author:\*\*\s*([^\n\*]+)/i);
				if (authorMatch) {
					author = authorMatch[1].trim();
				}

				// Try to extract title from embedded **Book:** pattern in content
				const bookMatch = fullContent.match(/\*\*Book:\*\*\s*([^\n\*]+)/i);
				if (bookMatch) {
					title = bookMatch[1].trim();
				} else {
					// Try to get title from filename as fallback
					title = file.basename.replace(/^\d+\s*-\s*/, '').replace(/\s*-\s*\d+.*$/, '') || 'Custom Flashcard';
				}

				// Try to extract location from embedded **Location:** or **Page:** pattern in content
				const locationMatch = fullContent.match(/\*\*(?:Location|Page):\*\*\s*([^\n\*]+)/i) ||
									  fullContent.match(/(?:Location|Page)\s*(\d+(?:-\d+)?)/i);
				if (locationMatch) {
					location = locationMatch[1].trim();
				}

				// Clean the main content by removing all metadata
				mainContent = fullContent
					.split('\n')
					.filter(line => {
						const l = line.trim();
						if (!l) return false;
						if (/^#/.test(l)) return false; // headers
						if (/^#?flashcard\b/i.test(l)) return false;
						if (/^\*{0,2}(answer|location|page|added\s*on|date|source|tags?|type|book|author)\*{0,2}\s*:/i.test(l)) return false;
						if (/---/.test(l)) return false; // separator lines
						return true;
					})
					.join(' ')
					.replace(/\s+/g, ' ')
					.replace(/^\"|\"$/g, '')
					.trim();
			}

			DebugLogger.log('Parsed flashcard:', { title, author, location, content: mainContent });

			// Return null if we don't have meaningful content
			if (!mainContent || mainContent.length < 3) {
				console.warn('No meaningful content found in flashcard:', file.path);
				return null;
			}

			return {
				title,
				author,
				type,
				location,
				date,
				content: mainContent
			};

		} catch (error) {
			console.error('Error parsing flashcard file:', file.path, error);
			return null;
		}
	}

	private shuffleArray<T>(array: T[]): T[] {
		const shuffled = [...array];
		for (let i = shuffled.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
		}
		return shuffled;
	}
}

class KindleCardsModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const {contentEl} = this;
		contentEl.setText('Woah!');
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}

class KindleCardsMainModal extends Modal {
	plugin: KindleCardsPlugin;

	constructor(app: App, plugin: KindleCardsPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.addClass('kindle-cards-main-modal');

		contentEl.createEl('h2', { text: 'KindleCards' });
		contentEl.createEl('p', { text: 'Sync your Kindle highlights and study with flashcards' });

		// Sync Section
		const syncSection = contentEl.createDiv('kindle-cards-main-section');
		syncSection.createEl('h3', { text: 'Sync Kindle Highlights' });
		syncSection.createEl('p', {
			text: 'Import highlights from your Kindle\'s My_Clippings.txt file and convert them into flashcards.',
			cls: 'kindle-cards-section-desc'
		});

		const syncButton = syncSection.createEl('button', {
			text: 'Sync Now',
			cls: 'kindle-cards-action-button kindle-cards-sync-btn'
		});
		syncButton.onclick = () => {
			this.close();
			this.plugin.syncKindleClippings();
		};

		// Study Section
		const studySection = contentEl.createDiv('kindle-cards-main-section');
		studySection.createEl('h3', { text: 'Study Flashcards' });
		studySection.createEl('p', {
			text: 'Review your flashcards in an interactive study session with spaced repetition.',
			cls: 'kindle-cards-section-desc'
		});

		const studyButton = studySection.createEl('button', {
			text: 'Start Study Session',
			cls: 'kindle-cards-action-button kindle-cards-study-btn'
		});
		studyButton.onclick = () => {
			this.close();
			this.plugin.startStudySession();
		};
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class KindleCardsSettingTab extends PluginSettingTab {
	plugin: KindleCardsPlugin;

	constructor(app: App, plugin: KindleCardsPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();
		
		// Main header
		containerEl.createEl('h1', {text: '📚 KindleCards Settings'});
		containerEl.createEl('p', {
			text: 'Configure your KindleCards experience with these comprehensive settings.',
			cls: 'setting-item-description'
		});

		// Basic Configuration Section
		containerEl.createEl('h2', {text: '⚙️ Basic Configuration'});

		new Setting(containerEl)
			.setName('Kindle Path')
			.setDesc('Path to your Kindle device or My Clippings.txt file')
			.addText(text => text
				.setPlaceholder('/Volumes/Kindle/documents/My Clippings.txt')
				.setValue(this.plugin.settings.kindlePath)
				.onChange(async (value) => {
					this.plugin.settings.kindlePath = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Output Folder')
			.setDesc('Folder where flashcards will be created in your vault')
			.addText(text => text
				.setPlaceholder('KindleCards')
				.setValue(this.plugin.settings.outputFolder)
				.onChange(async (value) => {
					this.plugin.settings.outputFolder = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Card Template')
			.setDesc('Template for flashcards. Use {{content}}, {{title}}, {{author}}, {{location}}')
			.addTextArea(text => text
				.setPlaceholder('{{content}}\n\n**Source:** {{title}} by {{author}} - Page {{location}}')
				.setValue(this.plugin.settings.cardTemplate)
				.onChange(async (value) => {
					this.plugin.settings.cardTemplate = value;
					await this.plugin.saveSettings();
				}));

		// Study Experience Section
		containerEl.createEl('h2', {text: '🎯 Study Experience'});

		new Setting(containerEl)
			.setName('Enable Card Flip Animation')
			.setDesc('Animate cards when flipping from question to answer')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableCardFlipAnimation)
				.onChange(async (value) => {
					this.plugin.settings.enableCardFlipAnimation = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Show Progress Statistics')
			.setDesc('Display progress bar and stats during study sessions')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showProgressStats)
				.onChange(async (value) => {
					this.plugin.settings.showProgressStats = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Enable Keyboard Shortcuts')
			.setDesc('Use keys 1-4 for difficulty buttons (Again, Hard, Good, Easy)')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableKeyboardShortcuts)
				.onChange(async (value) => {
					this.plugin.settings.enableKeyboardShortcuts = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Auto-Show Answer')
			.setDesc('Automatically reveal the answer after a delay')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoShowAnswer)
				.onChange(async (value) => {
					this.plugin.settings.autoShowAnswer = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Auto-Show Delay (seconds)')
			.setDesc('Seconds to wait before automatically showing the answer')
			.addSlider(slider => slider
				.setLimits(1, 30, 1)
				.setValue(this.plugin.settings.autoShowAnswerDelay)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.autoShowAnswerDelay = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Fullscreen Study Mode')
			.setDesc('Open study sessions in fullscreen modal')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableFullscreenStudy)
				.onChange(async (value) => {
					this.plugin.settings.enableFullscreenStudy = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Show Timer During Study')
			.setDesc('Display a timer showing how long you\'ve spent on each card')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showTimerDuringStudy)
				.onChange(async (value) => {
					this.plugin.settings.showTimerDuringStudy = value;
					await this.plugin.saveSettings();
				}));

		// Content Processing Section
		containerEl.createEl('h2', {text: '📝 Content Processing'});

		new Setting(containerEl)
			.setName('Include Highlighted Text')
			.setDesc('Process highlighted text from Kindle clippings')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.includeHighlightedText)
				.onChange(async (value) => {
					this.plugin.settings.includeHighlightedText = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Include Book Notes')
			.setDesc('Process personal notes from Kindle clippings')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.includeBookNotes)
				.onChange(async (value) => {
					this.plugin.settings.includeBookNotes = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Include Location Information')
			.setDesc('Add page/location info to flashcards')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.includeLocationInfo)
				.onChange(async (value) => {
					this.plugin.settings.includeLocationInfo = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Minimum Content Length')
			.setDesc('Minimum characters required for valid content')
			.addSlider(slider => slider
				.setLimits(1, 100, 5)
				.setValue(this.plugin.settings.minimumContentLength)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.minimumContentLength = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Maximum Content Length')
			.setDesc('Maximum characters before content is truncated')
			.addSlider(slider => slider
				.setLimits(100, 5000, 100)
				.setValue(this.plugin.settings.maximumContentLength)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.maximumContentLength = value;
					await this.plugin.saveSettings();
				}));

		// File Organization Section
		containerEl.createEl('h2', {text: '📁 File Organization'});

		new Setting(containerEl)
			.setName('Group Cards by Book')
			.setDesc('Create separate folders for each book\'s flashcards')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.groupCardsByBook)
				.onChange(async (value) => {
					this.plugin.settings.groupCardsByBook = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Use Author-Based Folders')
			.setDesc('Organize books into folders by author name')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.useBookAuthorFolders)
				.onChange(async (value) => {
					this.plugin.settings.useBookAuthorFolders = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Generate Table of Contents')
			.setDesc('Create an index file listing all books and cards')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.generateTOC)
				.onChange(async (value) => {
					this.plugin.settings.generateTOC = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Include Metadata Files')
			.setDesc('Generate JSON metadata files with book information')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.includeMetadataFiles)
				.onChange(async (value) => {
					this.plugin.settings.includeMetadataFiles = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Card File Naming Format')
			.setDesc('Template for flashcard filenames. Use {{title}}, {{author}}, {{location}}, {{index}}')
			.addText(text => text
				.setPlaceholder('{{title}} - {{location}}')
				.setValue(this.plugin.settings.cardFileNamingFormat)
				.onChange(async (value) => {
					this.plugin.settings.cardFileNamingFormat = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Enable Auto-Sync')
			.setDesc('Automatically sync when Kindle files change (experimental)')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableAutoSync)
				.onChange(async (value) => {
					this.plugin.settings.enableAutoSync = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Backup Before Sync')
			.setDesc('Create backup copies before syncing new content')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.backupBeforeSync)
				.onChange(async (value) => {
					this.plugin.settings.backupBeforeSync = value;
					await this.plugin.saveSettings();
				}));

		// UI/UX Preferences Section
		containerEl.createEl('h2', {text: '🎨 UI/UX Preferences'});

		new Setting(containerEl)
			.setName('Preferred Theme')
			.setDesc('Choose your preferred theme for the plugin interface')
			.addDropdown(dropdown => dropdown
				.addOption('auto', 'Auto (Follow Obsidian)')
				.addOption('light', 'Light Theme')
				.addOption('dark', 'Dark Theme')
				.setValue(this.plugin.settings.preferredTheme)
				.onChange(async (value: 'light' | 'dark' | 'auto') => {
					this.plugin.settings.preferredTheme = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Compact Mode')
			.setDesc('Use a more compact UI layout to save space')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.compactMode)
				.onChange(async (value) => {
					this.plugin.settings.compactMode = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Enable Bulk Operations')
			.setDesc('Allow bulk editing and deleting of flashcards')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableBulkOperations)
				.onChange(async (value) => {
					this.plugin.settings.enableBulkOperations = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Confirm Deletions')
			.setDesc('Ask for confirmation before deleting flashcards')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.confirmDeletions)
				.onChange(async (value) => {
					this.plugin.settings.confirmDeletions = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Show Advanced Statistics')
			.setDesc('Display detailed statistics and analytics')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showAdvancedStats)
				.onChange(async (value) => {
					this.plugin.settings.showAdvancedStats = value;
					await this.plugin.saveSettings();
				}));

		// Performance Settings Section
		containerEl.createEl('h2', {text: '⚡ Performance Settings'});

		new Setting(containerEl)
			.setName('Max Cards in Memory')
			.setDesc('Maximum number of cards to keep loaded in memory')
			.addSlider(slider => slider
				.setLimits(100, 5000, 100)
				.setValue(this.plugin.settings.maxCardsInMemory)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.maxCardsInMemory = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Enable Background Sync')
			.setDesc('Sync Kindle data in the background (may impact performance)')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableBackgroundSync)
				.onChange(async (value) => {
					this.plugin.settings.enableBackgroundSync = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Cache Book Data')
			.setDesc('Cache book metadata to improve loading times')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.cacheBookData)
				.onChange(async (value) => {
					this.plugin.settings.cacheBookData = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Enable Debug Logging')
			.setDesc('Enable detailed logging for troubleshooting (may impact performance)')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableDebugLogging)
				.onChange(async (value) => {
					this.plugin.settings.enableDebugLogging = value;
					await this.plugin.saveSettings();
				}));

		// Export/Import Settings Section
		containerEl.createEl('h2', {text: '📤 Export/Import Settings'});

		new Setting(containerEl)
			.setName('Include Statistics in Export')
			.setDesc('Include study statistics when exporting card data')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.exportIncludeStats)
				.onChange(async (value) => {
					this.plugin.settings.exportIncludeStats = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Default Export Format')
			.setDesc('Default format for exporting flashcard data')
			.addDropdown(dropdown => dropdown
				.addOption('json', 'JSON Format')
				.addOption('csv', 'CSV Spreadsheet')
				.addOption('anki', 'Anki Deck Package')
				.setValue(this.plugin.settings.exportFormat)
				.onChange(async (value: 'json' | 'csv' | 'anki') => {
					this.plugin.settings.exportFormat = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Enable Auto-Export')
			.setDesc('Automatically export data at regular intervals')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableAutoExport)
				.onChange(async (value) => {
					this.plugin.settings.enableAutoExport = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Auto-Export Interval (hours)')
			.setDesc('Hours between automatic exports')
			.addSlider(slider => slider
				.setLimits(1, 168, 1)
				.setValue(this.plugin.settings.autoExportInterval)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.autoExportInterval = value;
					await this.plugin.saveSettings();
				}));

		// Spaced Repetition Section
		containerEl.createEl('h2', {text: '🧠 Spaced Repetition'});

		new Setting(containerEl)
			.setName('Enable Spaced Repetition')
			.setDesc('Use Anki-compatible spaced repetition algorithm for optimal learning')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableSpacedRepetition)
				.onChange(async (value) => {
					this.plugin.settings.enableSpacedRepetition = value;
					await this.plugin.saveSettings();
				}));

		// Basic Settings
		containerEl.createEl('h3', {text: 'Daily Limits'});

		new Setting(containerEl)
			.setName('New Cards Per Day')
			.setDesc('Maximum number of new cards to introduce per day')
			.addSlider(slider => slider
				.setLimits(0, 100, 5)
				.setValue(this.plugin.settings.newCardsPerDay)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.newCardsPerDay = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Maximum Reviews Per Day')
			.setDesc('Maximum number of review cards to show per day (0 = unlimited)')
			.addSlider(slider => slider
				.setLimits(0, 500, 10)
				.setValue(this.plugin.settings.maximumReviewsPerDay)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.maximumReviewsPerDay = value;
					await this.plugin.saveSettings();
				}));

		// Learning Settings
		containerEl.createEl('h3', {text: 'Learning'});

		new Setting(containerEl)
			.setName('Learning Steps (minutes)')
			.setDesc('Steps for learning new cards (e.g., "1 10" means 1 minute, then 10 minutes)')
			.addText(text => text
				.setPlaceholder('1 10')
				.setValue(this.plugin.settings.learningSteps.join(' '))
				.onChange(async (value) => {
					const steps = value.split(/\s+/).map(s => parseInt(s)).filter(n => !isNaN(n) && n > 0);
					this.plugin.settings.learningSteps = steps.length > 0 ? steps : [1, 10];
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Graduating Interval (days)')
			.setDesc('Interval for new cards that graduate from learning')
			.addSlider(slider => slider
				.setLimits(1, 10, 1)
				.setValue(this.plugin.settings.graduatingInterval)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.graduatingInterval = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Easy Interval (days)')
			.setDesc('Interval for cards answered as "Easy" during learning')
			.addSlider(slider => slider
				.setLimits(2, 10, 1)
				.setValue(this.plugin.settings.easyInterval)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.easyInterval = value;
					await this.plugin.saveSettings();
				}));

		// Lapses Settings
		containerEl.createEl('h3', {text: 'Lapses'});

		new Setting(containerEl)
			.setName('Relearning Steps (minutes)')
			.setDesc('Steps for relearning lapsed cards')
			.addText(text => text
				.setPlaceholder('10')
				.setValue(this.plugin.settings.relearningSteps.join(' '))
				.onChange(async (value) => {
					const steps = value.split(/\s+/).map(s => parseInt(s)).filter(n => !isNaN(n) && n > 0);
					this.plugin.settings.relearningSteps = steps.length > 0 ? steps : [10];
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('New Interval (%)')
			.setDesc('New interval percentage after lapse (0% = restart from learning)')
			.addSlider(slider => slider
				.setLimits(0, 100, 5)
				.setValue(Math.round(this.plugin.settings.newInterval * 100))
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.newInterval = value / 100;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Minimum Interval (days)')
			.setDesc('Minimum interval for review cards')
			.addSlider(slider => slider
				.setLimits(1, 10, 1)
				.setValue(this.plugin.settings.minimumInterval)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.minimumInterval = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Leech Threshold')
			.setDesc('Number of lapses before card becomes a leech and is buried')
			.addSlider(slider => slider
				.setLimits(1, 20, 1)
				.setValue(this.plugin.settings.leechThreshold)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.leechThreshold = value;
					await this.plugin.saveSettings();
				}));

		// Reviews Settings
		containerEl.createEl('h3', {text: 'Reviews'});

		new Setting(containerEl)
			.setName('Starting Ease')
			.setDesc('Starting ease factor for new cards (250% = 2.5 multiplier)')
			.addSlider(slider => slider
				.setLimits(1.3, 5.0, 0.1)
				.setValue(this.plugin.settings.startingEase)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.startingEase = Math.round(value * 10) / 10;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Easy Bonus (%)')
			.setDesc('Multiplier for "Easy" button (130% = 1.3 multiplier)')
			.addSlider(slider => slider
				.setLimits(100, 300, 5)
				.setValue(Math.round(this.plugin.settings.easyBonus * 100))
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.easyBonus = value / 100;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Interval Modifier (%)')
			.setDesc('Global multiplier for all intervals (100% = no change)')
			.addSlider(slider => slider
				.setLimits(50, 200, 5)
				.setValue(Math.round(this.plugin.settings.intervalModifier * 100))
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.intervalModifier = value / 100;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Hard Interval (%)')
			.setDesc('Multiplier for "Hard" button (120% = 1.2 multiplier)')
			.addSlider(slider => slider
				.setLimits(100, 150, 5)
				.setValue(Math.round(this.plugin.settings.hardInterval * 100))
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.hardInterval = value / 100;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Maximum Interval (days)')
			.setDesc('Longest possible interval between reviews')
			.addSlider(slider => slider
				.setLimits(30, 36500, 50)
				.setValue(Math.min(this.plugin.settings.maximumInterval, 36500))
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.maximumInterval = value;
					await this.plugin.saveSettings();
				}));

		// Reset to defaults button
		new Setting(containerEl)
			.setName('Reset to Anki Defaults')
			.setDesc('Reset all spaced repetition settings to Anki default values')
			.addButton(button => button
				.setButtonText('Reset to Defaults')
				.setWarning()
				.onClick(async () => {
					// Reset to Anki defaults
					this.plugin.settings.learningSteps = [1, 10];
					this.plugin.settings.relearningSteps = [10];
					this.plugin.settings.graduatingInterval = 1;
					this.plugin.settings.easyInterval = 4;
					this.plugin.settings.startingEase = 2.5;
					this.plugin.settings.easyBonus = 1.3;
					this.plugin.settings.intervalModifier = 1.0;
					this.plugin.settings.maximumInterval = 36500;
					this.plugin.settings.hardInterval = 1.2;
					this.plugin.settings.newInterval = 0.0;
					this.plugin.settings.minimumInterval = 1;
					this.plugin.settings.leechThreshold = 8;
					this.plugin.settings.maximumReviewsPerDay = 200;
					this.plugin.settings.newCardsPerDay = 20;

					await this.plugin.saveSettings();

					new Notice('Spaced repetition settings reset to Anki defaults');
					this.display();
				}));

		// Management Actions Section
		containerEl.createEl('h2', {text: '🔧 Management Actions'});

		new Setting(containerEl)
			.setName('Export All Settings')
			.setDesc('Export your complete KindleCards configuration to a file')
			.addButton(button => button
				.setButtonText('Export Settings')
				.setCta()
				.onClick(async () => {
					try {
						const settings = JSON.stringify(this.plugin.settings, null, 2);
						const blob = new Blob([settings], { type: 'application/json' });
						const url = URL.createObjectURL(blob);
						const a = document.createElement('a');
						a.href = url;
						a.download = `kindlecards-settings-${new Date().toISOString().split('T')[0]}.json`;
						a.click();
						URL.revokeObjectURL(url);
						new Notice('Settings exported successfully');
					} catch (error) {
						new Notice('Failed to export settings');
						console.error('Export error:', error);
					}
				}));

		new Setting(containerEl)
			.setName('Reset All Settings')
			.setDesc('Reset ALL settings to default values (cannot be undone)')
			.addButton(button => button
				.setButtonText('Reset Everything')
				.setWarning()
				.onClick(async () => {
					// Confirm action
					const confirmed = await new Promise<boolean>((resolve) => {
						const modal = new Modal(this.app);
						modal.contentEl.createEl('h2', { text: '⚠️ Reset All Settings' });
						modal.contentEl.createEl('p', { 
							text: 'This will reset ALL KindleCards settings to their default values. This action cannot be undone.' 
						});
						modal.contentEl.createEl('p', { 
							text: 'Your flashcard data and spaced repetition progress will be preserved, but all preferences will be lost.' 
						});
						
						const buttonContainer = modal.contentEl.createEl('div', { cls: 'modal-button-container' });
						buttonContainer.style.display = 'flex';
						buttonContainer.style.gap = '10px';
						buttonContainer.style.justifyContent = 'center';
						buttonContainer.style.marginTop = '20px';
						
						const confirmBtn = buttonContainer.createEl('button', { text: 'Reset All Settings', cls: 'mod-warning' });
						const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
						
						confirmBtn.onclick = () => {
							modal.close();
							resolve(true);
						};
						cancelBtn.onclick = () => {
							modal.close();
							resolve(false);
						};
						
						modal.open();
					});
					
					if (confirmed) {
						// Preserve spaced repetition data
						const savedSRData = this.plugin.settings.spacedRepetitionData;
						
						// Reset to defaults
						this.plugin.settings = Object.assign({}, DEFAULT_SETTINGS);
						this.plugin.settings.spacedRepetitionData = savedSRData;
						
						await this.plugin.saveSettings();
						new Notice('All settings reset to defaults');
						this.display();
					}
				}));

		new Setting(containerEl)
			.setName('Clear Study Data')
			.setDesc('Clear all spaced repetition progress and study statistics')
			.addButton(button => button
				.setButtonText('Clear Study Data')
				.setWarning()
				.onClick(async () => {
					const confirmed = await new Promise<boolean>((resolve) => {
						const modal = new Modal(this.app);
						modal.contentEl.createEl('h2', { text: '⚠️ Clear Study Data' });
						modal.contentEl.createEl('p', { 
							text: 'This will clear all your spaced repetition progress and study statistics. All cards will be reset to "new" status.' 
						});
						modal.contentEl.createEl('p', { 
							text: 'This action cannot be undone!' 
						});
						
						const buttonContainer = modal.contentEl.createEl('div', { cls: 'modal-button-container' });
						buttonContainer.style.display = 'flex';
						buttonContainer.style.gap = '10px';
						buttonContainer.style.justifyContent = 'center';
						buttonContainer.style.marginTop = '20px';
						
						const confirmBtn = buttonContainer.createEl('button', { text: 'Clear All Data', cls: 'mod-warning' });
						const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
						
						confirmBtn.onclick = () => {
							modal.close();
							resolve(true);
						};
						cancelBtn.onclick = () => {
							modal.close();
							resolve(false);
						};
						
						modal.open();
					});
					
					if (confirmed) {
						this.plugin.settings.spacedRepetitionData = {};
						if (this.plugin.spacedRepetition) {
							this.plugin.spacedRepetition = new SpacedRepetitionSystem({}, this.plugin.settings);
						}
						await this.plugin.saveSettings();
						new Notice('All study data cleared');
						this.display();
					}
				}));		// Show spaced repetition stats if enabled
		if (this.plugin.settings.enableSpacedRepetition) {
			const allCardIds = Object.keys(this.plugin.settings.spacedRepetitionData);
			if (allCardIds.length > 0) {
				const stats = this.plugin.spacedRepetition.getStats(allCardIds);

				containerEl.createEl('h3', {text: 'Review Statistics'});

				const statsContainer = containerEl.createEl('div', {cls: 'srs-stats-container'});

				const statsItems = [
					{label: 'Total Cards', value: stats.total},
					{label: 'Due Today', value: stats.due},
					{label: 'New Cards', value: stats.new},
					{label: 'Learning', value: stats.learning}
				];

				statsItems.forEach(stat => {
					const statEl = statsContainer.createEl('div', {cls: 'srs-stat-item'});
					statEl.createEl('span', {text: stat.value.toString(), cls: 'srs-stat-value'});
					statEl.createEl('span', {text: stat.label, cls: 'srs-stat-label'});
				});
			}
		}
	}
}

class CommitMessageModal extends Modal {
	private changedFiles: number;
	private onSubmit: (message: string | null) => void;
	private messageInput: TextComponent;

	constructor(app: App, changedFiles: number, onSubmit: (message: string | null) => void) {
		super(app);
		this.changedFiles = changedFiles;
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('commit-message-modal');

		// Header
		contentEl.createEl('h2', { text: '📝 Commit to GitHub' });
		contentEl.createEl('p', {
			text: `${this.changedFiles} file(s) changed. Enter a commit message:`,
			cls: 'commit-info'
		});

		// Input field
		const inputContainer = contentEl.createEl('div', { cls: 'commit-input-container' });

		this.messageInput = new TextComponent(inputContainer)
			.setPlaceholder('e.g., Add new feature, Fix bug, Update documentation...')
			.setValue(`Update KindleCards - ${new Date().toLocaleDateString()}`);

		this.messageInput.inputEl.style.width = '100%';
		this.messageInput.inputEl.style.marginBottom = '1em';

		// Suggestions
		const suggestionsEl = contentEl.createEl('div', { cls: 'commit-suggestions' });
		suggestionsEl.createEl('p', { text: 'Quick suggestions:', cls: 'suggestions-header' });

		const suggestions = [
			'🐛 Fix spaced repetition bugs',
			'✨ Add new GitHub integration',
			'📝 Update documentation',
			'🎨 Improve UI/UX',
			'⚡ Performance improvements',
			'🔧 Configuration updates'
		];

		suggestions.forEach(suggestion => {
			const btn = suggestionsEl.createEl('button', {
				text: suggestion,
				cls: 'suggestion-btn'
			});
			btn.onclick = () => {
				this.messageInput.setValue(suggestion);
				this.messageInput.inputEl.focus();
			};
		});

		// Buttons
		const buttonContainer = contentEl.createEl('div', { cls: 'commit-buttons' });

		const commitBtn = buttonContainer.createEl('button', {
			text: '🚀 Commit & Push',
			cls: 'mod-cta'
		});
		commitBtn.onclick = () => {
			const message = this.messageInput.getValue().trim();
			if (message) {
				this.close();
				this.onSubmit(message);
			} else {
				new Notice('Please enter a commit message');
			}
		};

		const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
		cancelBtn.onclick = () => {
			this.close();
			this.onSubmit(null);
		};

		// Focus input and select text
		setTimeout(() => {
			this.messageInput.inputEl.focus();
			this.messageInput.inputEl.select();
		}, 100);

		// Enter key support
		this.messageInput.inputEl.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				commitBtn.click();
			}
		});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
