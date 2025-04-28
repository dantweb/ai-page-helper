const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { OpenAI } = require('openai');
const { setTimeout: sleep } = require('timers/promises');

class AiPageHelperService {
    static RETRY_ATTEMPTS = 5;
    static RETRY_DELAY = 5000; // 5 seconds
    static PROMPTS_PATH = path.join(process.cwd(), 'prompts');

    constructor() {
        this.config = this.loadConfig();
        this.client = new OpenAI({
            baseURL: this.config.FEATHERLESS_API_URL,
            apiKey: this.config.FEATHERLESS_API_KEY,
            timeout: 120000
        });
    }

    loadConfig() {
        try {
            // Try multiple possible locations for the config file
            const possiblePaths = [
                path.resolve(__dirname, '../../config.yaml'),  // From src/services relative to project root
                path.join(process.cwd(), 'config.yaml')        // From current working directory
            ];

            let configPath = null;
            for (const p of possiblePaths) {
                if (fs.existsSync(p)) {
                    configPath = p;
                    break;
                }
            }

            // If running in Jest environment and no config file found, return a default test config
            if (!configPath && (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined)) {
                return {
                    FEATHERLESS_API_URL: 'https://api.example.com',
                    FEATHERLESS_API_KEY: 'test-key-for-testing-only',
                    MODEL_NAME: 'test-model',
                    MAX_TOKENS: 1000
                };
            }

            if (!configPath) {
                throw new Error('Config file not found in any of the expected locations');
            }

            // Read file synchronously
            const fileContent = fs.readFileSync(configPath, 'utf8');
            return yaml.load(fileContent);
        } catch (error) {
            console.error('Error loading config:', error);

            // Special case for the specific test that needs to test process.exit
            if (process.env.TEST_EXIT_BEHAVIOR === 'true') {
                process.exit(1);
            }

            // For normal Jest tests, throw instead of exiting
            if (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined) {
                throw error;
            }

            // In production, exit with error code
            process.exit(1);

        }
    }

    async findLocator(html, query) {
        try {
            const prompt = this.loadPrompt('locator_prompt.txt');
            const systemContent = { instruction: prompt };
            const userContent = { html, query };

            return await this.getResponse(
                this.config.MODEL_NAME,
                systemContent,
                userContent,
                this.config.MAX_TOKENS
            );
        } catch (error) {
            console.error('Error finding locator:', error);
            throw error;
        }
    }

    async getResponse(model, systemContent, userContent, maxTokens) {
        let lastError;

        for (let attempt = 1; attempt <= AiPageHelperService.RETRY_ATTEMPTS; attempt++) {
            try {
                console.log(`Attempt ${attempt} of ${AiPageHelperService.RETRY_ATTEMPTS}`);

                const response = await this.fetchResponseWithRetries(
                    model,
                    systemContent,
                    userContent,
                    maxTokens,
                    5,
                    2000
                );

                if (response) {
                    const content = response.choices[0].message.content;
                    return this.cleanResponse(content);
                }
            } catch (error) {
                lastError = error;
                console.error(`Attempt ${attempt} failed:`, error);

                if (attempt < AiPageHelperService.RETRY_ATTEMPTS) {
                    await sleep(AiPageHelperService.RETRY_DELAY);
                }
            }
        }

        throw lastError || new Error('All response attempts failed');
    }

    async fetchResponseWithRetries(model, systemContent, userContent, maxTokens, maxRetries, pauseTime) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const response = await this.client.chat.completions.create({
                    model,
                    messages: [
                        { role: 'system', content: JSON.stringify(systemContent) },
                        { role: 'user', content: JSON.stringify(userContent) }
                    ],
                    max_tokens: maxTokens,
                    timeout: 300000
                });

                if (response?.choices?.[0]?.message?.content) {
                    return response;
                }

                console.log(`Empty response, retrying... (${attempt}/${maxRetries})`);
                await sleep(pauseTime);
            } catch (error) {
                console.error(`API Error: ${error.message}`);
                if (attempt < maxRetries) await sleep(pauseTime);
            }
        }
        return null;
    }

    loadPrompt(filename) {
        try {
            return fs.readFileSync(
                path.join(AiPageHelperService.PROMPTS_PATH, filename),
                'utf8'
            );
        } catch (error) {
            throw new Error(`Prompt file not found: ${filename}`);
        }
    }

    cleanResponse(content) {
        const cleanText = content
            .replace(/^```json\s*/gm, '')
            .replace(/\s*```$/gm, '')
            .trim();

        try {
            // Parse the JSON string into an object
            return JSON.parse(cleanText);
        } catch (error) {
            console.error('Error parsing JSON response:', error);
            return cleanText;  // Fall back to returning the cleaned string
        }
    }
}

module.exports = {
    AiPageHelperService,
    default: new AiPageHelperService()
};
