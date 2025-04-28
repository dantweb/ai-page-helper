#!/bin/bash

# ============================
# Script: get_contents.sh
# Description:
#   Collects contents of specified files and directories,
#   filtering by predefined file types, and writes them
#   to an output file with headers.
# Usage:
#   ./get_contents.sh output.txt <source_path1> [source_path2] [...]
# ============================

# -------- Configuration --------
# Define the array of file extensions to include (without the dot)
FILE_TYPES=("txt" "sh" "md" "py" "js" "env" "yml" "php")  # Modify as needed
# ---------------------------------

# Function to display usage information
usage() {
    echo "Usage: $0 output.txt <source_file_or_dir_path> [another file or dir] ..."
    exit 1
}

# Check if at least two arguments are provided
if [ "$#" -lt 2 ]; then
    echo "Error: Insufficient arguments."
    usage
fi

# Assign the first argument as the output file
OUTPUT_FILE="$1"
shift  # Shift to process the remaining arguments as source paths

# Initialize (truncate) the output file
> "$OUTPUT_FILE"

# Function to check if a file has a valid extension
is_valid_type() {
    local filename="$1"
    local extension="${filename##*.}"

    # Handle files without an extension
    if [ "$extension" = "$filename" ]; then
        return 1
    fi

    for ext in "${FILE_TYPES[@]}"; do
        if [[ "$extension" == "$ext" ]]; then
            return 0
        fi
    done
    return 1
}

# Function to process a single file
process_file() {
    local file="$1"

    if is_valid_type "$file"; then
        echo "##filepath: $file" >> "$OUTPUT_FILE"
        cat "$file" >> "$OUTPUT_FILE"
        echo -e "\n" >> "$OUTPUT_FILE"  # Add a newline for separation
    fi
}

# Function to process a directory recursively
process_directory() {
    local dir="$1"

    # Build the find command with the specified file types
    local find_cmd=(find "$dir" -type f \( )
    local first=true
    for ext in "${FILE_TYPES[@]}"; do
        if [ "$first" = true ]; then
            find_cmd+=( -iname "*.${ext}" )
            first=false
        else
            find_cmd+=( -o -iname "*.${ext}" )
        fi
    done
    find_cmd+=( \))

    # Execute the find command and process each file
    while IFS= read -r file; do
        process_file "$file"
    done < <("${find_cmd[@]}")
}

# Iterate over each source path provided as an argument
for src in "$@"; do
    if [ -f "$src" ]; then
        # Source is a file
        process_file "$src"
    elif [ -d "$src" ]; then
        # Source is a directory
        process_directory "$src"
    else
        # Source is neither a file nor a directory
        echo "Warning: '$src' is not a valid file or directory and will be skipped." >&2
    fi
done

echo "Contents have been written to '$OUTPUT_FILE'."