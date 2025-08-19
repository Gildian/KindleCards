import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile, TFolder } from 'obsidian';
import { KindleParser } from './kindle-parser';
import { FlashcardGenerator } from './flashcard-generator';
import { FlashcardStudyModal } from './flashcard-modal';

// Remember to rename these classes and interfaces!

interface KindleCardsSettings {
	kindlePath: string;
	outputFolder: string;
	cardTemplate: string;
	autoSync: boolean;
	templateType: string;
	addTags: boolean;
	addBacklinks: boolean;
	addFrontmatter: boolean;
	groupByBook: boolean;
	fileNamePattern: string;
}

const DEFAULT_SETTINGS: KindleCardsSettings = {
	kindlePath: '',
	outputFolder: 'KindleCards',
	cardTemplate: '{{content}}\n\n---\n\n**Source:** {{title}} by {{author}}\n**Location:** {{location}}',
	autoSync: false,
	templateType: 'Simple Q&A',
	addTags: true,
	addBacklinks: false,
	addFrontmatter: false,
	groupByBook: false,
	fileNamePattern: '{{title}} - {{location}}'
}

export interface KindleClipping {
	title: string;
	author: string;
	type: string;
	location: string;
	date: string;
	content: string;
}

export default class KindleCardsPlugin extends Plugin {
	settings: KindleCardsSettings;

	async onload() {
		await this.loadSettings();

		// This creates a single icon in the left ribbon for both sync and study
		const ribbonIconEl = this.addRibbonIcon('book-open', 'KindleCards', (evt: MouseEvent) => {
			// Open the main KindleCards interface
			this.openKindleCardsInterface();
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

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new KindleCardsSettingTab(this.app, this));
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
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
						console.log('Selected file:', file.name, 'Size:', file.size);
						const reader = new FileReader();
						reader.onload = (e) => {
							const content = e.target?.result as string;
							console.log('File content length:', content?.length);
							console.log('File content preview:', content?.substring(0, 200));
							resolve(content);
						};
						reader.onerror = (e) => {
							console.error('Error reading file:', e);
							resolve(null);
						};
						reader.readAsText(file);
					} else {
						console.log('No file selected');
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
		const fileName = this.settings.groupByBook
			? FlashcardGenerator.generateGroupedFileName(clipping, 'book')
			: FlashcardGenerator.generateFileName(clipping, this.settings.fileNamePattern);

		const filePath = `${this.settings.outputFolder}/${fileName}`;

		// Create necessary folders for grouped files
		const folderPath = filePath.substring(0, filePath.lastIndexOf('/'));
		await this.ensureFolderExists(folderPath);

		// Create flashcard content with enhanced options
		const options = {
			addTags: this.settings.addTags,
			addBacklinks: this.settings.addBacklinks,
			addFrontmatter: this.settings.addFrontmatter
		};

		const flashcardContent = FlashcardGenerator.generateFlashcard(clipping, this.settings.cardTemplate, options);

		// Check if file already exists
		const existingFile = this.app.vault.getAbstractFileByPath(filePath);
		if (existingFile) {
			// File exists, could implement update logic here
			return;
		}

		// Create new file
		await this.app.vault.create(filePath, flashcardContent);
	}

	createFlashcardContent(clipping: KindleClipping): string {
		// Use the flashcard generator instead
		return FlashcardGenerator.generateFlashcard(clipping, this.settings.cardTemplate);
	}

	async createFlashcardFromText(text: string) {
		const fileName = FlashcardGenerator.sanitizeFileName(`Flashcard - ${new Date().toISOString().split('T')[0]}`) + '.md';
		const filePath = `${this.settings.outputFolder}/${fileName}`;

		const flashcardContent = `${text}\n?\n${text}`;

		await this.app.vault.create(filePath, flashcardContent);
		new Notice('Flashcard created!');
	}

	async ensureFolderExists(folderPath: string) {
		const folder = this.app.vault.getAbstractFileByPath(folderPath);
		if (!folder) {
			await this.app.vault.createFolder(folderPath);
		}
	}

	async startStudySession() {
		try {
			// Get all flashcards from the output folder
			const clippings = await this.loadAllFlashcards();

			if (clippings.length === 0) {
				new Notice('No flashcards found! Sync your Kindle highlights first.');
				return;
			}

			// Shuffle the cards for better studying
			const shuffledClippings = this.shuffleArray([...clippings]);

			// Open the study modal
			const studyModal = new FlashcardStudyModal(this.app, shuffledClippings);
			studyModal.open();

		} catch (error) {
			console.error('Error starting study session:', error);
			new Notice('Error starting study session. Check console for details.');
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

			const shuffledClippings = this.shuffleArray([...clippings]);
			const studyModal = new FlashcardStudyModal(this.app, shuffledClippings);
			studyModal.open();

		} catch (error) {
			console.error('Error studying current folder:', error);
			new Notice('Error studying current folder. Check console for details.');
		}
	}

	private async loadAllFlashcards(): Promise<KindleClipping[]> {
		const clippings: KindleClipping[] = [];
		const folder = this.app.vault.getAbstractFileByPath(this.settings.outputFolder);

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

			// Try to extract metadata from frontmatter or content
			const lines = content.split('\n');
			let title = 'Unknown';
			let author = 'Unknown';
			let location = 'Unknown';
			let date = 'Unknown';
			let type = 'Highlight';

			// Look for YAML frontmatter
			if (content.startsWith('---')) {
				const frontmatterEnd = content.indexOf('---', 3);
				if (frontmatterEnd > 0) {
					const frontmatter = content.substring(4, frontmatterEnd);
					const yamlLines = frontmatter.split('\n');

					for (const line of yamlLines) {
						if (line.includes('book:')) title = line.split('book:')[1]?.replace(/['"]/g, '').trim() || title;
						if (line.includes('author:')) author = line.split('author:')[1]?.replace(/['"]/g, '').trim() || author;
						if (line.includes('location:')) location = line.split('location:')[1]?.replace(/['"]/g, '').trim() || location;
						if (line.includes('date:')) date = line.split('date:')[1]?.replace(/['"]/g, '').trim() || date;
						if (line.includes('type:')) type = line.split('type:')[1]?.replace(/['"]/g, '').trim() || type;
					}
				}
			}

			// Extract the main content (remove frontmatter and metadata)
			let mainContent = content;
			if (content.startsWith('---')) {
				const frontmatterEnd = content.indexOf('---', 3);
				if (frontmatterEnd > 0) {
					mainContent = content.substring(frontmatterEnd + 3).trim();
				}
			}

			// Try to extract content from different template formats
			const cleanContent = this.extractContentFromFlashcard(mainContent);

			return {
				title,
				author,
				type,
				location,
				date,
				content: cleanContent
			};

		} catch (error) {
			console.error('Error parsing flashcard file:', file.path, error);
			return null;
		}
	}

	private extractContentFromFlashcard(content: string): string {
		// Remove common markdown formatting and try to extract the main quote
		let extracted = content;

		// Remove headers
		extracted = extracted.replace(/^#+\s+.*/gm, '');

		// Look for quoted content
		const quoteMatch = extracted.match(/[""]([^"""]+)[""]/) || extracted.match(/"([^"]+)"/);
		if (quoteMatch) {
			return quoteMatch[1].trim();
		}

		// Look for content in blockquotes
		const blockquoteMatch = extracted.match(/^>\s*(.+)/m);
		if (blockquoteMatch) {
			return blockquoteMatch[1].trim();
		}

		// Take first substantial paragraph
		const lines = extracted.split('\n').filter(line => {
			const trimmed = line.trim();
			return trimmed &&
				   !trimmed.startsWith('#') &&
				   !trimmed.startsWith('**Source:**') &&
				   !trimmed.startsWith('**Book:**') &&
				   !trimmed.startsWith('**Author:**') &&
				   !trimmed.startsWith('*From') &&
				   !trimmed.startsWith('---') &&
				   !trimmed.match(/^[*#-]/);
		});

		return lines[0]?.trim() || content.trim();
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
		syncSection.createEl('h3', { text: '📖 Sync Kindle Highlights' });
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
		studySection.createEl('h3', { text: '🧠 Study Flashcards' });
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

		// Quick Actions
		const quickSection = contentEl.createDiv('kindle-cards-main-section');
		quickSection.createEl('h3', { text: '⚡ Quick Actions' });

		const actionsDiv = quickSection.createDiv('kindle-cards-quick-actions');

		const studyFolderButton = actionsDiv.createEl('button', {
			text: 'Study Current Folder',
			cls: 'kindle-cards-quick-button'
		});
		studyFolderButton.onclick = () => {
			this.close();
			this.plugin.studyCurrentFolder();
		};

		const settingsButton = actionsDiv.createEl('button', {
			text: 'Settings',
			cls: 'kindle-cards-quick-button'
		});
		settingsButton.onclick = () => {
			this.close();
			// Open settings
			(this.app as any).setting.open();
			(this.app as any).setting.openTabById(this.plugin.manifest.id);
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
			.setDesc('Folder where flashcards will be created')
			.addText(text => text
				.setPlaceholder('KindleCards')
				.setValue(this.plugin.settings.outputFolder)
				.onChange(async (value) => {
					this.plugin.settings.outputFolder = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Template Type')
			.setDesc('Choose a predefined template style')
			.addDropdown(dropdown => {
				FlashcardGenerator.DEFAULT_TEMPLATES.forEach(template => {
					dropdown.addOption(template.name, template.name);
				});
				dropdown
					.setValue(this.plugin.settings.templateType)
					.onChange(async (value) => {
						this.plugin.settings.templateType = value;
						const selectedTemplate = FlashcardGenerator.DEFAULT_TEMPLATES.find(t => t.name === value);
						if (selectedTemplate) {
							this.plugin.settings.cardTemplate = selectedTemplate.template;
						}
						await this.plugin.saveSettings();
						this.display(); // Refresh to show updated template
					});
			});

		new Setting(containerEl)
			.setName('Card Template')
			.setDesc('Template for flashcards. Use {{content}}, {{title}}, {{author}}, {{location}}, {{date}}, {{type}}')
			.addTextArea(text => text
				.setPlaceholder('{{content}}\n\n**Source:** {{title}} by {{author}}')
				.setValue(this.plugin.settings.cardTemplate)
				.onChange(async (value) => {
					this.plugin.settings.cardTemplate = value;
					await this.plugin.saveSettings();
				}));

		// File Organization Section
		containerEl.createEl('h3', { text: 'File Organization' });

		new Setting(containerEl)
			.setName('Group by Book')
			.setDesc('Organize flashcards in folders by book title')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.groupByBook)
				.onChange(async (value) => {
					this.plugin.settings.groupByBook = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('File Name Pattern')
			.setDesc('Pattern for flashcard file names')
			.addText(text => text
				.setPlaceholder('{{title}} - {{location}}')
				.setValue(this.plugin.settings.fileNamePattern)
				.onChange(async (value) => {
					this.plugin.settings.fileNamePattern = value;
					await this.plugin.saveSettings();
				}));

		// Enhancement Options Section
		containerEl.createEl('h3', { text: 'Enhancement Options' });

		new Setting(containerEl)
			.setName('Add Tags')
			.setDesc('Automatically add tags for author, book, and highlight type')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.addTags)
				.onChange(async (value) => {
					this.plugin.settings.addTags = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Add Backlinks')
			.setDesc('Add links to book and author pages')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.addBacklinks)
				.onChange(async (value) => {
					this.plugin.settings.addBacklinks = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Add YAML Frontmatter')
			.setDesc('Include structured metadata at the top of each flashcard')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.addFrontmatter)
				.onChange(async (value) => {
					this.plugin.settings.addFrontmatter = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Auto Sync')
			.setDesc('Automatically sync when Kindle is connected (coming soon)')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoSync)
				.onChange(async (value) => {
					this.plugin.settings.autoSync = value;
					await this.plugin.saveSettings();
				}));
	}
}
