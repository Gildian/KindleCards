// Test the exact validation logic used in the plugin
const fs = require('fs');

const content = fs.readFileSync('./sample-My_Clippings.txt', 'utf-8');

console.log('=== Testing Validation Logic ===');
console.log('File content length:', content.length);
console.log('Has separator?', content.includes('=========='));

// Test the exact validation function logic
function validateClippingsFile(content) {
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
    const clippings = parseClippings(content);

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

function parseClippings(content) {
    const clippings = [];
    const sections = content.split('==========');

    for (const section of sections) {
        const clipping = parseSection(section);
        if (clipping) {
            clippings.push(clipping);
        }
    }

    return clippings;
}

function parseSection(section) {
    const lines = section.trim().split('\n').filter(line => line.trim());

    if (lines.length < 3) {
        console.log('Section rejected: less than 3 lines', lines);
        return null;
    }

    const titleAuthorLine = lines[0];
    const metadataLine = lines[1];
    const contentLines = lines.slice(2); // Fixed: was slice(3)

    console.log('Processing section:', {
        title: titleAuthorLine,
        metadata: metadataLine,
        contentLines: contentLines,
        contentLinesLength: contentLines.length
    });

    const content = contentLines.join('\n').trim();

    if (!content) {
        console.log('Section rejected: no content');
        return null;
    }

    return {
        title: titleAuthorLine,
        content: content
    };
}

const validation = validateClippingsFile(content);
console.log('Validation result:', validation);
