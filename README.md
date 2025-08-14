# KindleCards

An Obsidian plugin that converts Kindle highlights from My_Clippings.txt into flashcards.

## Features

- Import highlights from Kindle's My_Clippings.txt file
- Automatically create flashcards with highlights as questions and quotes as answers
- Customizable flashcard templates
- Organize flashcards in a dedicated folder
- Create flashcards from selected text in any note

## Installation

### From GitHub

1. Download the latest release from the releases page
2. Extract the plugin folder to your vault's `.obsidian/plugins/` directory
3. Reload Obsidian
4. Enable the plugin in Settings > Community Plugins

### For Development

1. Clone this repository into your vault's `.obsidian/plugins/` folder
2. Run `npm install` to install dependencies
3. Run `npm run dev` to build the plugin in development mode
4. Reload Obsidian
5. Enable the plugin in Settings > Community Plugins

## Usage

### Syncing Kindle Highlights

1. Connect your Kindle device to your computer
2. Open the plugin settings and set the path to your My_Clippings.txt file
3. Click the KindleCards ribbon icon or use the "Sync Kindle Clippings" command
4. The plugin will parse your highlights and create flashcards in the specified output folder

### Creating Manual Flashcards

1. Select any text in a note
2. Use the "Create flashcard from selection" command
3. A new flashcard will be created in your KindleCards folder

### Settings

- **Kindle Path**: Path to your Kindle's My_Clippings.txt file
- **Output Folder**: Folder where flashcards will be created (default: KindleCards)
- **Card Template**: Customize how flashcards are formatted using variables like {{highlight}}, {{quote}}, {{title}}, {{author}}, etc.
- **Auto Sync**: Automatically sync when Kindle is detected (coming soon)

## Flashcard Format

The default flashcard format follows the spaced repetition format:

```
[Highlight text]
?
[Full quote/passage]
```

You can customize this format in the settings using template variables:
- `{{highlight}}` - The highlighted text
- `{{quote}}` - The full quote/passage
- `{{title}}` - Book title
- `{{author}}` - Book author
- `{{location}}` - Kindle location
- `{{date}}` - Date the highlight was added

## My_Clippings.txt Format

This plugin parses the standard My_Clippings.txt format from Kindle devices:

```
Book Title (Author Name)
- Your Highlight on Location 1234-1235 | Added on Monday, January 1, 2024 12:00:00 PM

Highlighted text content here.
==========
```

## Development

```bash
# Install dependencies
npm install

# Build for development (with file watching)
npm run dev

# Build for production
npm run build
```

## License

MIT License - see LICENSE file for details.

## Contributing

Contributions are welcome! Please feel free to submit issues, feature requests, or pull requests.
