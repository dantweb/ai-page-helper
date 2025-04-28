// Fixed import to match your export structure
const { AiPageHelperService, default: aiHelperServiceInstance } = require('../../src/services/ai-page-helper-service');
const fs = require('fs');
const { OpenAI } = require('openai');
const yaml = require('js-yaml');

// Mock dependencies
jest.mock('openai');
jest.mock('fs');
jest.mock('js-yaml');
jest.mock('timers/promises');

describe('AIHelperService', () => {
    const mockHtml = '<html><div id="product-123"></div></html>';
    const mockQuery = 'Find product locator';
    const mockConfig = {
        FEATHERLESS_API_URL: 'https://api.example.com',
        FEATHERLESS_API_KEY: 'test-key',
        MODEL_NAME: 'test-model',
        MAX_TOKENS: 1000
    };
    let aiHelperService; // This will be our test instance

    beforeEach(() => {
        // Reset all mocks
        jest.clearAllMocks();

        // Mock fs.existsSync to return true for config path
        fs.existsSync = jest.fn().mockReturnValue(true);

        // Mock config loading
        yaml.load.mockReturnValue(mockConfig);
        fs.readFileSync.mockImplementation((filePath) => {
            if (filePath.includes('config.yaml')) return 'mock config content';
            if (filePath.includes('locator_prompt.txt')) return 'test prompt';
            throw new Error('File not found');
        });

        // Mock OpenAI client
        OpenAI.mockImplementation(() => ({
            chat: {
                completions: {
                    create: jest.fn()
                }
            }
        }));

        // Create a fresh instance for testing
        aiHelperService = new AiPageHelperService();
    });

    describe('findLocator', () => {
        it('should return cleaned response for valid HTML and query', async () => {
            const mockResponse = {
                choices: [{
                    message: {
                        content: '```json\n{"locator": "#product-123", "type": "css"}\n```'
                    }
                }]
            };
            aiHelperService.client.chat.completions.create.mockResolvedValue(mockResponse);

            const result = await aiHelperService.findLocator(mockHtml, mockQuery);

            expect(result).toEqual({
                locator: '#product-123',
                type: 'css'
            });
        });

        it('should throw error when API fails after retries', async () => {
            aiHelperService.client.chat.completions.create.mockRejectedValue(new Error('API Error'));

            await expect(aiHelperService.findLocator(mockHtml, mockQuery))
                .rejects
                .toThrow('All response attempts failed');
        });
    });

    describe('config loading', () => {
        it('should handle config loading errors', () => {
            // Mock yaml.load to throw an error
            yaml.load.mockImplementation(() => {
                throw new Error('Config error');
            });

            // Expect creating a new instance to throw
            expect(() => new AiPageHelperService()).toThrow('Config error');
        });



        it('should exit process when config loading fails', () => {
            process.env.TEST_EXIT_BEHAVIOR = 'true';
            fs.existsSync.mockReturnValue(true);
            yaml.load.mockImplementation(() => {
                throw new Error('Config error');
            });
            const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {});

            new AiPageHelperService();

            expect(mockExit).toHaveBeenCalledWith(1);

            delete process.env.TEST_EXIT_BEHAVIOR;
            mockExit.mockRestore();
        });
    });

    describe('retry logic', () => {
        it('should retry specified number of times on failure', async () => {
            const mockError = new Error('Temporary error');
            aiHelperService.client.chat.completions.create
                .mockRejectedValueOnce(mockError)
                .mockRejectedValueOnce(mockError)
                .mockResolvedValue({
                    choices: [{
                        message: { content: '{"locator": "//div", "type": "xpath"}' }
                    }]
                });

            const result = await aiHelperService.findLocator(mockHtml, mockQuery);

            expect(aiHelperService.client.chat.completions.create).toHaveBeenCalledTimes(3);
            expect(result).toEqual({
                locator: '//div',
                type: 'xpath'
            });
        });
    });

    describe('response cleaning', () => {
        it('should clean JSON response with code markers', () => {
            const dirtyResponse = '```json\n{"key": "value"}\n```';
            const cleaned = aiHelperService.cleanResponse(dirtyResponse);
            expect(cleaned).toBe('{"key": "value"}');
        });

        it('should handle response without code markers', () => {
            const cleanResponse = '{"key": "value"}';
            const result = aiHelperService.cleanResponse(cleanResponse);
            expect(result).toBe(cleanResponse);
        });
    });

    describe('prompt handling', () => {
        it('should load prompt from file', () => {
            const prompt = aiHelperService.loadPrompt('locator_prompt.txt');
            expect(prompt).toBe('test prompt');
        });

        it('should throw error for missing prompt file', () => {
            fs.readFileSync.mockImplementation(() => {
                throw new Error('File not found');
            });

            expect(() => aiHelperService.loadPrompt('missing.txt'))
                .toThrow('Prompt file not found: missing.txt');
        });
    });

    describe('error handling', () => {
        it('should handle empty API response', async () => {
            aiHelperService.client.chat.completions.create.mockResolvedValue({ choices: [] });

            await expect(aiHelperService.findLocator(mockHtml, mockQuery))
                .rejects
                .toThrow('All response attempts failed');
        });

        it('should handle invalid JSON response', async () => {
            aiHelperService.client.chat.completions.create.mockResolvedValue({
                choices: [{
                    message: {
                        content: 'invalid json'
                    }
                }]
            });

            await expect(aiHelperService.findLocator(mockHtml, mockQuery))
                .rejects
                .toThrow();
        });
    });
});