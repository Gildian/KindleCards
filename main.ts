import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile } from 'obsidian';
import { KindleParser } from './kindle-parser';
import { FlashcardGenerator } from './flashcard-generator';

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

		// This creates an icon in the left ribbon.
		const ribbonIconEl = this.addRibbonIcon('book-open', 'KindleCards', (evt: MouseEvent) => {
			// Called when the user clicks the icon.
			this.syncKindleClippings();
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
