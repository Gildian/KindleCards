import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile } from 'obsidian';
import { KindleParser } from './kindle-parser';
import { FlashcardGenerator } from './flashcard-generator';

// Remember to rename these classes and interfaces!

interface KindleCardsSettings {
	kindlePath: string;
	outputFolder: string;
	cardTemplate: string;
	autoSync: boolean;
}

const DEFAULT_SETTINGS: KindleCardsSettings = {
	kindlePath: '',
	outputFolder: 'KindleCards',
	cardTemplate: '{{highlight}}\n?\n{{quote}}',
	autoSync: false
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
		const fileName = FlashcardGenerator.generateFileName(clipping);
		const filePath = `${this.settings.outputFolder}/${fileName}`;

		// Create flashcard content
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
			.setName('Card Template')
			.setDesc('Template for flashcards. Use {{highlight}}, {{quote}}, {{title}}, {{author}}, {{location}}, {{date}}')
			.addTextArea(text => text
				.setPlaceholder('{{highlight}}\n?\n{{quote}}')
				.setValue(this.plugin.settings.cardTemplate)
				.onChange(async (value) => {
					this.plugin.settings.cardTemplate = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Auto Sync')
			.setDesc('Automatically sync when Kindle is connected')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoSync)
				.onChange(async (value) => {
					this.plugin.settings.autoSync = value;
					await this.plugin.saveSettings();
				}));
	}
}
