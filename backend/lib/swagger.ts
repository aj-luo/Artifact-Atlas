import type { OpenAPIV3 } from 'openapi-types';

export const swaggerSpec: OpenAPIV3.Document = {
  openapi: '3.0.0',
  info: {
    title:       'Artifact Atlas API',
    version:     '1.0.0',
    description: 'Backend for the Artifact Atlas guessing game.',
  },
  servers: [{ url: '/api', description: 'Next.js API routes' }],
  tags: [
    { name: 'Game',     description: 'Game flow — new game, guessing, forfeit' },
    { name: 'Artifact', description: 'MetObjects artifact lookup' },
    { name: 'Report',   description: 'Inaccuracy reporting' },
    { name: 'Health',   description: 'Liveness check' },
  ],
  paths: {
    // ── Game ──────────────────────────────────────────────────────────────────
    '/game/new': {
      post: {
        tags:    ['Game'],
        summary: 'Start a new game',
        description:
          'Picks a random eligible MetObjects artifact and returns a game session.',
        responses: {
          '201': {
            description: 'Game created',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    gameId:   { type: 'string', format: 'uuid', example: 'a1b2c3d4-...' },
                    imageUrl: { type: 'string', format: 'uri' },
                    //title:    { type: 'string', example: 'Virgin and Child Enthroned' },
                  },
                  required: ['gameId', 'imageUrl'],
                },
              },
            },
          },
          '404': { description: 'No eligible artifacts found' },
        },
      },
    },

    '/game/{gameId}': {
      get: {
        tags:    ['Game'],
        summary: 'Get game state',
        description: 'Returns current guess history and derived status without revealing the answer.',
        parameters: [
          { name: 'gameId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': {
            description: 'Game state',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    gameId:     { type: 'string' },
                    status:     { type: 'string', enum: ['active', 'won', 'lost', 'forfeited'] },
                    guessesLeft:{ type: 'integer', example: 4 },
                    guesses:    { type: 'array', items: { $ref: '#/components/schemas/GuessRecord' } },
                  },
                },
              },
            },
          },
          '404': { description: 'Game not found' },
        },
      },
    },

    '/game/{gameId}/guess': {
      post: {
        tags:    ['Game'],
        summary: 'Submit a guess or forfeit',
        parameters: [
          { name: 'gameId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/GuessRequest' },
              examples: {
                normalGuess: {
                  summary: 'Normal guess',
                  value: { country: 'CAN', year: 1965 },
                },
                forfeit: {
                  summary: 'Forfeit',
                  value: { forfeit: true },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Guess result',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/GuessResponse' },
              },
            },
          },
          '400': { description: 'Missing or invalid fields' },
          '404': { description: 'Game not found' },
          '409': { description: 'Game already finished' },
        },
      },
    },

    // ── Artifact ──────────────────────────────────────────────────────────────
    '/artifacts/{id}': {
      get: {
        tags:    ['Artifact'],
        summary: 'Get artifact metadata',
        description: 'Returns public MetObjects fields. Does not reveal country or year.',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', example: '469719' } },
        ],
        responses: {
          '200': {
            description: 'Artifact metadata',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ArtifactPublic' },
              },
            },
          },
          '404': { description: 'Artifact not found' },
        },
      },
      delete: {
        tags:    ['Artifact'],
        summary: 'Delete artifact (disabled)',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '405': { description: 'Method not allowed' },
        },
      },
    },

    // ── Report ────────────────────────────────────────────────────────────────
    '/report': {
      post: {
        tags:    ['Report'],
        summary: 'Report an inaccuracy',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ReportRequest' },
              example: {
                objectId:             '469719',
                is_date_incorrect:     true,
                is_location_incorrect: false,
                description:          'The date shown is wrong — piece is from 1820.',
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Report submitted',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    id:      { type: 'string' },
                    message: { type: 'string', example: 'Report submitted' },
                  },
                },
              },
            },
          },
          '400': { description: 'Missing required fields' },
          '404': { description: 'Artifact not found' },
        },
      },
    },

    // ── Health ────────────────────────────────────────────────────────────────
    '/health': {
      get: {
        tags:    ['Health'],
        summary: 'DB connectivity check',
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'ok' },
                    db:     { type: 'string', example: 'connected' },
                  },
                },
              },
            },
          },
          '503': { description: 'Database unreachable' },
        },
      },
    },
  },

  components: {
    schemas: {
      GuessRequest: {
        type: 'object',
        description:
          'Identify the game with `gameId` in the URL only. Body: either `{ forfeit: true }` or `{ country`, `year` } (ISO alpha-3 + year). Do not send Met object id — the server loads it from session state.',
        properties: {
          country: { type: 'string', description: 'ISO 3166-1 alpha-3 country code', example: 'CAN' },
          year:    { type: 'integer', description: 'Guessed year (AD positive, BC negative)', example: 1965 },
          forfeit: { type: 'boolean', description: 'Set true to forfeit the game immediately' },
        },
      },

      GuessResponse: {
        type: 'object',
        properties: {
          guessNumber: { type: 'integer', example: 1 },
          guessesLeft: { type: 'integer', example: 4 },
          gameStatus:  { type: 'string', enum: ['active', 'won', 'lost', 'forfeited'] },
          geo: {
            type: 'object',
            properties: {
              cardinal:   { type: 'string', example: 'SE', description: 'Compass bucket from bearing' },
              distanceKm: { type: 'integer', example: 3124 },
              display:    { type: 'string', example: '190.005°, 3124km' },
            },
          },
          year: {
            type: 'object',
            properties: {
              hint: { type: 'string', enum: ['Older', 'Younger', 'Correct'] },
            },
          },
        },
      },

      GuessRecord: {
        type: 'object',
        properties: {
          guessNumber: { type: 'integer' },
          country:     { type: 'string', example: 'CAN' },
          year:        { type: 'integer', example: 1965 },
          geo: {
            type: 'object',
            properties: {
              distanceKm: { type: 'integer' },
              display:    { type: 'string' },
            },
          },
          yearHint: { type: 'string', enum: ['Older', 'Younger', 'Correct'] },
          correct:  { type: 'boolean' },
        },
      },

      ArtifactPublic: {
        type: 'object',
        properties: {
          Object_ID:               { type: 'string' },
          Title:                   { type: 'string' },
          Object_Name:             { type: 'string' },
          Culture:                 { type: 'string' },
          Period:                  { type: 'string' },
          Classification:          { type: 'string' },
          Primary_Image_URL:       { type: 'string', format: 'uri' },
          Primary_Image_Small_URL: { type: 'string', format: 'uri' },
          Tags:                    { type: 'string' },
        },
      },

      ReportRequest: {
        type: 'object',
        required: ['objectId'],
        properties: {
          objectId:             { type: 'string', example: '469719' },
          is_date_incorrect:    { type: 'boolean' },
          is_location_incorrect:{ type: 'boolean' },
          description:          { type: 'string', example: 'The date shown is wrong.' },
        },
      },
    },
  },
};
