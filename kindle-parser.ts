import { KindleClipping } from './types';

export class KindleParser {
    static parseClippings(content: string): KindleClipping[] {
        const clippings: KindleClipping[] = [];
        const sections = content.split('==========');

        for (const section of sections) {
            const clipping = this.parseSection(section);
            if (clipping) {
                clippings.push(clipping);
            }
        }

        return clippings;
    }

    private static parseSection(section: string): KindleClipping | null {
        const lines = section.trim().split('\n').filter(line => line.trim());

        if (lines.length < 3) {
            return null;
        }

        const titleAuthorLine = lines[0];
        const metadataLine = lines[1];
        const contentLines = lines.slice(2); // Content starts at index 2

        // Parse title and author
        const { title, author } = this.parseTitleAndAuthor(titleAuthorLine);

        // Parse metadata
        const metadata = this.parseMetadata(metadataLine);

        const content = contentLines.join('\n').trim();

        if (!content) {
            return null;
        }

        return {
            title,
            author,
            type: metadata.type,
            location: metadata.location,
            date: metadata.date,
            content
        };
    }

    private static parseTitleAndAuthor(line: string): { title: string; author: string } {
        // Format: "Title (Author)" or just "Title"
        const match = line.match(/^(.+?)\s*\((.+?)\)\s*$/);

        if (match) {
            return {
                title: match[1].trim(),
                author: match[2].trim()
            };
        }

        return {
            title: line.trim(),
            author: 'Unknown Author'
        };
    }

    private static parseMetadata(line: string): { type: string; location: string; date: string } {
        // Format: "- Your Highlight on Location 123-456 | Added on Monday, January 1, 2024 12:00:00 PM"

        const typeMatch = line.match(/- Your (Highlight|Note|Bookmark)/i);
        const locationMatch = line.match(/Location (\d+(?:-\d+)?)/i);
        const dateMatch = line.match(/Added on (.+)$/i);

        return {
            type: typeMatch ? typeMatch[1] : 'Unknown',
            location: locationMatch ? locationMatch[1] : 'Unknown',
            date: dateMatch ? dateMatch[1].trim() : 'Unknown'
        };
    }

    static validateClippingsFile(content: string): { valid: boolean; message: string } {
        if (!content || content.trim().length === 0) {
            return {
                valid: false,
                message: 'File is empty'
            };
        }

        // Check if it contains the separator
        if (!content.includes('==========')) {
            return {
                valid: false,
                message: 'File does not appear to be a valid My Clippings.txt file (missing separators)'
            };
        }

        // Try to parse and see if we get any valid clippings
        const clippings = this.parseClippings(content);

        if (clippings.length === 0) {
            return {
                valid: false,
                message: 'No valid clippings found in file'
            };
        }

        return {
            valid: true,
            message: `Found ${clippings.length} clippings`
        };
    }
}
