#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  Tool,
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import axios, { AxiosInstance } from 'axios';
import dotenv from 'dotenv';

dotenv.config();

// Tool definitions
const LOOKUP_PERSON_TOOL: Tool = {
  name: 'rocketreach_lookup_person',
  description: 'Lookup contact information for a prospect/profile.',
  inputSchema: {
    type: 'object',
    properties: {
      id: {
        type: 'integer',
        description: 'RocketReach internal person ID returned by searches.',
      },
      name: {
        type: 'string',
        description: 'Full name of the person. Must specify along with current_employer.',
      },
      current_employer: {
        type: 'string',
        description: 'Current employer of the person. Must specify along with name.',
      },
      title: {
        type: 'string',
        description: 'Desired prospect\'s job title. May improve match rate.',
      },
      linkedin_url: {
        type: 'string',
        description: 'LinkedIn URL of prospect to lookup.',
      },
      email: {
        type: 'string',
        description: 'A known email address of the prospect. May improve match rate.',
      },
      npi_number: {
        type: 'integer',
        description: 'An NPI number for a US healthcare professional. Can be used as a unique match criteria.',
      },
      lookup_type: {
        type: 'string',
        enum: ['standard', 'premium', 'premium (feeds disabled)', 'bulk', 'phone', 'enrich'],
        description: 'Specify an alternative lookup type to use (if available).',
      }
    },
    required: [],
  },
};

const SEARCH_COMPANIES_TOOL: Tool = {
  name: 'rocketreach_search_companies',
  description: 'Search for companies based on various criteria.',
  inputSchema: {
    type: 'object',
    properties: {
      start: {
        type: 'integer',
        description: 'Paginate through search results by returning results starting from this value (counting from 1).',
        minimum: 1,
        maximum: 10000,
        default: 1
      },
      page_size: {
        type: 'integer',
        description: 'Maximum number of search results to return per page.',
        minimum: 1,
        maximum: 100,
        default: 10
      },
      query: {
        type: 'object',
        description: 'Search query parameters',
        properties: {
          competitors: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of competitor companies'
          },
          description: {
            type: 'array',
            items: { type: 'string' },
            description: 'Keywords to match in company descriptions'
          },
          domain: {
            type: 'array',
            items: { type: 'string' },
            description: 'Company domains to search for'
          },
          employees: {
            type: 'array',
            items: { type: 'string' },
            description: 'Employee count ranges (e.g., "1-10", "11-50")'
          },
          geo: {
            type: 'array',
            items: { type: 'string' },
            description: 'Geographic locations'
          },
          industry: {
            type: 'array',
            items: { type: 'string' },
            description: 'Industry names'
          },
          name: {
            type: 'array',
            items: { type: 'string' },
            description: 'Company names to search for'
          },
          revenue: {
            type: 'array',
            items: { type: 'string' },
            description: 'Revenue ranges'
          },
          techstack: {
            type: 'array',
            items: { type: 'string' },
            description: 'Technology stack components'
          }
        }
      },
      order_by: {
        type: 'string',
        enum: ['relevance', 'popularity', 'score'],
        description: 'How to order the results',
        default: 'relevance'
      }
    },
    required: ['query'],
  },
};

const FIND_PROFESSIONAL_EMAIL_TOOL: Tool = {
  name: 'rocketreach_find_professional_email',
  description: 'Find a professional email for an individual.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'The full name of the person',
      },
      first_name: {
        type: 'string',
        description: 'The first name of the person (alternative to name)',
      },
      last_name: {
        type: 'string',
        description: 'The last name of the person (alternative to name)',
      },
      company: {
        type: 'string',
        description: 'The company name where the person works',
      },
      company_domain: {
        type: 'string',
        description: 'The domain of the company (alternative to company)',
      },
      title: {
        type: 'string',
        description: 'The job title of the person (optional)',
      },
      linkedin_url: {
        type: 'string',
        description: 'The LinkedIn URL of the person (optional)',
      }
    },
    required: [],
  },
};

const FIND_PERSONAL_EMAIL_TOOL: Tool = {
  name: 'rocketreach_find_personal_email',
  description: 'Find a personal email for an individual.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'The full name of the person',
      },
      first_name: {
        type: 'string',
        description: 'The first name of the person (alternative to name)',
      },
      last_name: {
        type: 'string',
        description: 'The last name of the person (alternative to name)',
      },
      company: {
        type: 'string',
        description: 'The company name where the person works (optional)',
      },
      title: {
        type: 'string',
        description: 'The job title of the person (optional)',
      },
      linkedin_url: {
        type: 'string',
        description: 'The LinkedIn URL of the person (optional)',
      }
    },
    required: [],
  },
};

const ENRICH_COMPANY_TOOL: Tool = {
  name: 'rocketreach_enrich_company',
  description: 'Enrich company data.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'The name of the company',
      },
      domain: {
        type: 'string',
        description: 'The domain of the company (alternative to name)',
      }
    },
    required: [],
  },
};

const FIND_PHONE_TOOL: Tool = {
  name: 'rocketreach_find_phone',
  description: 'Find a phone number for an individual.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'The full name of the person',
      },
      first_name: {
        type: 'string',
        description: 'The first name of the person (alternative to name)',
      },
      last_name: {
        type: 'string',
        description: 'The last name of the person (alternative to name)',
      },
      company: {
        type: 'string',
        description: 'The company name where the person works (optional)',
      },
      title: {
        type: 'string',
        description: 'The job title of the person (optional)',
      },
      linkedin_url: {
        type: 'string',
        description: 'The LinkedIn URL of the person (optional)',
      }
    },
    required: [],
  },
};

// Type definitions
interface LookupPersonParams {
  id?: number;
  name?: string;
  current_employer?: string;
  title?: string;
  linkedin_url?: string;
  email?: string;
  npi_number?: number;
  lookup_type?: 'standard' | 'premium' | 'premium (feeds disabled)' | 'bulk' | 'phone' | 'enrich';
}

interface SearchCompaniesParams {
  start?: number;
  page_size?: number;
  query: {
    competitors?: string[];
    exclude_competitors?: string[];
    description?: string[];
    exclude_description?: string[];
    domain?: string[];
    exclude_domain?: string[];
    email_domain?: string[];
    exclude_email_domain?: string[];
    employees?: string[];
    exclude_employees?: string[];
    extended_keyword?: string[];
    exclude_extended_keyword?: string[];
    geo?: string[];
    exclude_geo?: string[];
    growth?: string[];
    exclude_growth?: string[];
    id?: string[];
    exclude_id?: string[];
    industry?: string[];
    exclude_industry?: string[];
    industry_keywords?: string[];
    exclude_industry_keywords?: string[];
    industry_tags?: string[];
    exclude_industry_tags?: string[];
    insight?: string[];
    exclude_insight?: string[];
    intent?: string[];
    exclude_intent?: string[];
    is_primary?: string[];
    exclude_is_primary?: string[];
    keyword?: string[];
    exclude_keyword?: string[];
    link?: string[];
    exclude_link?: string[];
    location?: string[];
    exclude_location?: string[];
    naics_code?: string[];
    exclude_naics_code?: string[];
    name?: string[];
    exclude_name?: string[];
    news_timestamp?: string[];
    exclude_news_timestamp?: string[];
    phone?: string[];
    exclude_phone?: string[];
    primary_industry?: string[];
    exclude_primary_industry?: string[];
    publicly_traded?: string[];
    exclude_publicly_traded?: string[];
    revenue?: string[];
    exclude_revenue?: string[];
    sic_code?: string[];
    exclude_sic_code?: string[];
    simplified_keyword?: string[];
    exclude_simplified_keyword?: string[];
    techstack?: string[];
    exclude_techstack?: string[];
    total_funding?: string[];
    exclude_total_funding?: string[];
    website_category?: string[];
    exclude_website_category?: string[];
    website_url?: string[];
    exclude_website_url?: string[];
  };
  order_by?: 'relevance' | 'popularity' | 'score';
}

interface FindProfessionalEmailParams {
  name?: string;
  first_name?: string;
  last_name?: string;
  company?: string;
  company_domain?: string;
  title?: string;
  linkedin_url?: string;
}

interface FindPersonalEmailParams {
  name?: string;
  first_name?: string;
  last_name?: string;
  company?: string;
  title?: string;
  linkedin_url?: string;
}

interface EnrichCompanyParams {
  name?: string;
  domain?: string;
}

interface FindPhoneParams {
  name?: string;
  first_name?: string;
  last_name?: string;
  company?: string;
  title?: string;
  linkedin_url?: string;
}

// Type guards
function isLookupPersonParams(args: unknown): args is LookupPersonParams {
  if (typeof args !== 'object' || args === null) {
    return false;
  }

  // Check if at least one required parameter is provided
  const hasId = 'id' in args && typeof (args as { id: unknown }).id === 'number';
  const hasNameAndEmployer = 
    'name' in args && typeof (args as { name: unknown }).name === 'string' &&
    'current_employer' in args && typeof (args as { current_employer: unknown }).current_employer === 'string';
  const hasLinkedIn = 'linkedin_url' in args && typeof (args as { linkedin_url: unknown }).linkedin_url === 'string';
  const hasEmail = 'email' in args && typeof (args as { email: unknown }).email === 'string';
  const hasNpiNumber = 'npi_number' in args && typeof (args as { npi_number: unknown }).npi_number === 'number';

  if (!(hasId || hasNameAndEmployer || hasLinkedIn || hasEmail || hasNpiNumber)) {
    return false;
  }

  // Check optional parameters
  if (
    'title' in args &&
    (args as { title: unknown }).title !== undefined &&
    typeof (args as { title: unknown }).title !== 'string'
  ) {
    return false;
  }

  if (
    'lookup_type' in args &&
    (args as { lookup_type: unknown }).lookup_type !== undefined
  ) {
    const lookupType = (args as { lookup_type: unknown }).lookup_type;
    const validTypes = ['standard', 'premium', 'premium (feeds disabled)', 'bulk', 'phone', 'enrich'];
    if (typeof lookupType !== 'string' || !validTypes.includes(lookupType)) {
      return false;
    }
  }

  return true;
}

function isSearchCompaniesParams(args: unknown): args is SearchCompaniesParams {
  if (typeof args !== 'object' || args === null) {
    return false;
  }

  // Check if query is provided and is an object
  if (!('query' in args) || typeof (args as { query: unknown }).query !== 'object' || (args as { query: unknown }).query === null) {
    return false;
  }

  // Check optional parameters
  if (
    'start' in args &&
    (args as { start: unknown }).start !== undefined &&
    (typeof (args as { start: unknown }).start !== 'number' || 
     (args as { start: number }).start < 1 || 
     (args as { start: number }).start > 10000)
  ) {
    return false;
  }

  if (
    'page_size' in args &&
    (args as { page_size: unknown }).page_size !== undefined &&
    (typeof (args as { page_size: unknown }).page_size !== 'number' || 
     (args as { page_size: number }).page_size < 1 || 
     (args as { page_size: number }).page_size > 100)
  ) {
    return false;
  }

  if (
    'order_by' in args &&
    (args as { order_by: unknown }).order_by !== undefined
  ) {
    const orderBy = (args as { order_by: unknown }).order_by;
    const validOrders = ['relevance', 'popularity', 'score'];
    if (typeof orderBy !== 'string' || !validOrders.includes(orderBy)) {
      return false;
    }
  }

  return true;
}

function isFindProfessionalEmailParams(args: unknown): args is FindProfessionalEmailParams {
  if (
    typeof args !== 'object' ||
    args === null
  ) {
    return false;
  }

  // At least one of name, first_name+last_name, or linkedin_url must be provided
  if (
    !('name' in args && typeof (args as { name: unknown }).name === 'string') &&
    !('linkedin_url' in args && typeof (args as { linkedin_url: unknown }).linkedin_url === 'string') &&
    !('first_name' in args && typeof (args as { first_name: unknown }).first_name === 'string' &&
      'last_name' in args && typeof (args as { last_name: unknown }).last_name === 'string')
  ) {
    return false;
  }

  // At least one of company or company_domain must be provided
  if (
    !('company' in args && typeof (args as { company: unknown }).company === 'string') &&
    !('company_domain' in args && typeof (args as { company_domain: unknown }).company_domain === 'string')
  ) {
    return false;
  }

  // Optional parameters
  if (
    'title' in args &&
    (args as { title: unknown }).title !== undefined &&
    typeof (args as { title: unknown }).title !== 'string'
  ) {
    return false;
  }

  return true;
}

function isFindPersonalEmailParams(args: unknown): args is FindPersonalEmailParams {
  if (
    typeof args !== 'object' ||
    args === null
  ) {
    return false;
  }

  // At least one of name, first_name+last_name, or linkedin_url must be provided
  if (
    !('name' in args && typeof (args as { name: unknown }).name === 'string') &&
    !('linkedin_url' in args && typeof (args as { linkedin_url: unknown }).linkedin_url === 'string') &&
    !('first_name' in args && typeof (args as { first_name: unknown }).first_name === 'string' &&
      'last_name' in args && typeof (args as { last_name: unknown }).last_name === 'string')
  ) {
    return false;
  }

  // Optional parameters
  if (
    'company' in args &&
    (args as { company: unknown }).company !== undefined &&
    typeof (args as { company: unknown }).company !== 'string'
  ) {
    return false;
  }

  if (
    'title' in args &&
    (args as { title: unknown }).title !== undefined &&
    typeof (args as { title: unknown }).title !== 'string'
  ) {
    return false;
  }

  return true;
}

function isEnrichCompanyParams(args: unknown): args is EnrichCompanyParams {
  if (
    typeof args !== 'object' ||
    args === null
  ) {
    return false;
  }

  // At least one of name or domain must be provided
  if (
    !('name' in args && typeof (args as { name: unknown }).name === 'string') &&
    !('domain' in args && typeof (args as { domain: unknown }).domain === 'string')
  ) {
    return false;
  }

  return true;
}

function isFindPhoneParams(args: unknown): args is FindPhoneParams {
  if (
    typeof args !== 'object' ||
    args === null
  ) {
    return false;
  }

  // At least one of name, first_name+last_name, or linkedin_url must be provided
  if (
    !('name' in args && typeof (args as { name: unknown }).name === 'string') &&
    !('linkedin_url' in args && typeof (args as { linkedin_url: unknown }).linkedin_url === 'string') &&
    !('first_name' in args && typeof (args as { first_name: unknown }).first_name === 'string' &&
      'last_name' in args && typeof (args as { last_name: unknown }).last_name === 'string')
  ) {
    return false;
  }

  // Optional parameters
  if (
    'company' in args &&
    (args as { company: unknown }).company !== undefined &&
    typeof (args as { company: unknown }).company !== 'string'
  ) {
    return false;
  }

  if (
    'title' in args &&
    (args as { title: unknown }).title !== undefined &&
    typeof (args as { title: unknown }).title !== 'string'
  ) {
    return false;
  }

  return true;
}

// Server implementation
const server = new Server(
  {
    name: 'rocketreach-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
      logging: {},
    },
  }
);

// Get API key from environment variables
const ROCKETREACH_API_KEY = process.env.ROCKETREACH_API_KEY;
const ROCKETREACH_API_URL = 'https://api.rocketreach.co/v2';

// Check if API key is provided
if (!ROCKETREACH_API_KEY) {
  console.error('Error: ROCKETREACH_API_KEY environment variable is required');
  process.exit(1);
}

// Configuration for retries and monitoring
const CONFIG = {
  retry: {
    maxAttempts: Number(process.env.ROCKETREACH_RETRY_MAX_ATTEMPTS) || 3,
    initialDelay: Number(process.env.ROCKETREACH_RETRY_INITIAL_DELAY) || 1000,
    maxDelay: Number(process.env.ROCKETREACH_RETRY_MAX_DELAY) || 10000,
    backoffFactor: Number(process.env.ROCKETREACH_RETRY_BACKOFF_FACTOR) || 2,
  },
};

// Initialize Axios instance for API requests
const apiClient: AxiosInstance = axios.create({
  baseURL: ROCKETREACH_API_URL,
  headers: {
    'Content-Type': 'application/json',
    'Api-Key': ROCKETREACH_API_KEY
  }
});

let isStdioTransport = false;

function safeLog(
  level:
    | 'error'
    | 'debug'
    | 'info'
    | 'notice'
    | 'warning'
    | 'critical'
    | 'alert'
    | 'emergency',
  data: any
): void {
  if (isStdioTransport) {
    // For stdio transport, log to stderr to avoid protocol interference
    console.error(
      `[${level}] ${typeof data === 'object' ? JSON.stringify(data) : data}`
    );
  } else {
    // For other transport types, use the normal logging mechanism
    server.sendLoggingMessage({ level, data });
  }
}

// Add utility function for delay
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Add retry logic with exponential backoff
async function withRetry<T>(
  operation: () => Promise<T>,
  context: string,
  attempt = 1
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const isRateLimit =
      error instanceof Error &&
      (error.message.includes('rate limit') || error.message.includes('429'));

    if (isRateLimit && attempt < CONFIG.retry.maxAttempts) {
      const delayMs = Math.min(
        CONFIG.retry.initialDelay *
          Math.pow(CONFIG.retry.backoffFactor, attempt - 1),
        CONFIG.retry.maxDelay
      );

      safeLog(
        'warning',
        `Rate limit hit for ${context}. Attempt ${attempt}/${CONFIG.retry.maxAttempts}. Retrying in ${delayMs}ms`
      );

      await delay(delayMs);
      return withRetry(operation, context, attempt + 1);
    }

    throw error;
  }
}

// Tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    LOOKUP_PERSON_TOOL,
    SEARCH_COMPANIES_TOOL,
    FIND_PROFESSIONAL_EMAIL_TOOL,
    FIND_PERSONAL_EMAIL_TOOL,
    ENRICH_COMPANY_TOOL,
    FIND_PHONE_TOOL,
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const startTime = Date.now();
  try {
    const { name, arguments: args } = request.params;

    // Log incoming request with timestamp
    safeLog(
      'info',
      `[${new Date().toISOString()}] Received request for tool: ${name}`
    );

    if (!args) {
      throw new Error('No arguments provided');
    }

    switch (name) {
      case 'rocketreach_lookup_person': {
        if (!isLookupPersonParams(args)) {
          throw new McpError(
            ErrorCode.InvalidParams,
            'Invalid arguments for rocketreach_lookup_person. You must provide at least one of: id, name+current_employer, linkedin_url, email, or npi_number.'
          );
        }

        try {
          const lookupParams: any = {};
          
          if (args.id) {
            lookupParams.id = args.id;
          }
          
          if (args.name) {
            lookupParams.name = args.name;
          }
          
          if (args.current_employer) {
            lookupParams.current_employer = args.current_employer;
          }
          
          if (args.title) {
            lookupParams.title = args.title;
          }
          
          if (args.linkedin_url) {
            lookupParams.linkedin_url = args.linkedin_url;
          }
          
          if (args.email) {
            lookupParams.email = args.email;
          }
          
          if (args.npi_number) {
            lookupParams.npi_number = args.npi_number;
          }
          
          if (args.lookup_type) {
            lookupParams.lookup_type = args.lookup_type;
          }
          
          const response = await withRetry(
            async () => apiClient.post('/lookupProfile', lookupParams),
            'lookup person'
          );

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(response.data, null, 2),
              },
            ],
            isError: false,
          };
        } catch (error) {
          const errorMessage = axios.isAxiosError(error)
            ? `API Error: ${error.response?.data?.message || error.message}`
            : `Error: ${error instanceof Error ? error.message : String(error)}`;

          return {
            content: [{ type: 'text', text: errorMessage }],
            isError: true,
          };
        }
      }

      case 'rocketreach_search_companies': {
        if (!isSearchCompaniesParams(args)) {
          throw new McpError(
            ErrorCode.InvalidParams,
            'Invalid arguments for rocketreach_search_companies. You must provide a query object.'
          );
        }

        try {
          const searchParams: any = {
            start: args.start || 1,
            page_size: args.page_size || 10,
            query: args.query,
            order_by: args.order_by || 'relevance'
          };
          
          const response = await withRetry(
            async () => apiClient.post('/searchCompanies', searchParams),
            'search companies'
          );

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(response.data, null, 2),
              },
            ],
            isError: false,
          };
        } catch (error) {
          const errorMessage = axios.isAxiosError(error)
            ? `API Error: ${error.response?.data?.message || error.message}`
            : `Error: ${error instanceof Error ? error.message : String(error)}`;

          return {
            content: [{ type: 'text', text: errorMessage }],
            isError: true,
          };
        }
      }

      case 'rocketreach_find_professional_email': {
        if (!isFindProfessionalEmailParams(args)) {
          throw new McpError(
            ErrorCode.InvalidParams,
            'Invalid arguments for rocketreach_find_professional_email. You must provide at least one of: name, first_name+last_name, or linkedin_url, and at least one of: company or company_domain.'
          );
        }

        try {
          // First, search for the person
          const searchParams: any = {};
          
          if (args.name) {
            searchParams.name = args.name;
          } else if (args.first_name && args.last_name) {
            searchParams.first_name = args.first_name;
            searchParams.last_name = args.last_name;
          }
          
          if (args.company) {
            searchParams.current_employer = args.company;
          } else if (args.company_domain) {
            searchParams.current_employer_domain = args.company_domain;
          }
          
          if (args.title) {
            searchParams.current_title = args.title;
          }
          
          if (args.linkedin_url) {
            searchParams.linkedin_url = args.linkedin_url;
          }
          
          const response = await withRetry(
            async () => apiClient.post('/lookupProfile', searchParams),
            'find professional email'
          );
          
          // Filter the response to only include professional emails
          const data = response.data;
          if (data.emails) {
            data.emails = data.emails.filter((email: any) => email.type === 'professional');
          }

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(data, null, 2),
              },
            ],
            isError: false,
          };
        } catch (error) {
          const errorMessage = axios.isAxiosError(error)
            ? `API Error: ${error.response?.data?.message || error.message}`
            : `Error: ${error instanceof Error ? error.message : String(error)}`;

          return {
            content: [{ type: 'text', text: errorMessage }],
            isError: true,
          };
        }
      }

      case 'rocketreach_find_personal_email': {
        if (!isFindPersonalEmailParams(args)) {
          throw new McpError(
            ErrorCode.InvalidParams,
            'Invalid arguments for rocketreach_find_personal_email. You must provide at least one of: name, first_name+last_name, or linkedin_url.'
          );
        }

        try {
          // First, search for the person
          const searchParams: any = {};
          
          if (args.name) {
            searchParams.name = args.name;
          } else if (args.first_name && args.last_name) {
            searchParams.first_name = args.first_name;
            searchParams.last_name = args.last_name;
          }
          
          if (args.company) {
            searchParams.current_employer = args.company;
          }
          
          if (args.title) {
            searchParams.current_title = args.title;
          }
          
          if (args.linkedin_url) {
            searchParams.linkedin_url = args.linkedin_url;
          }
          
          const response = await withRetry(
            async () => apiClient.post('/lookupProfile', searchParams),
            'find personal email'
          );
          
          // Filter the response to only include personal emails
          const data = response.data;
          if (data.emails) {
            data.emails = data.emails.filter((email: any) => email.type === 'personal');
          }

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(data, null, 2),
              },
            ],
            isError: false,
          };
        } catch (error) {
          const errorMessage = axios.isAxiosError(error)
            ? `API Error: ${error.response?.data?.message || error.message}`
            : `Error: ${error instanceof Error ? error.message : String(error)}`;

          return {
            content: [{ type: 'text', text: errorMessage }],
            isError: true,
          };
        }
      }

      case 'rocketreach_enrich_company': {
        if (!isEnrichCompanyParams(args)) {
          throw new McpError(
            ErrorCode.InvalidParams,
            'Invalid arguments for rocketreach_enrich_company. You must provide at least one of: name or domain.'
          );
        }

        try {
          const searchParams: any = {};
          
          if (args.name) {
            searchParams.name = args.name;
          }
          
          if (args.domain) {
            searchParams.domain = args.domain;
          }
          
          const response = await withRetry(
            async () => apiClient.post('/lookupCompany', searchParams),
            'enrich company'
          );

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(response.data, null, 2),
              },
            ],
            isError: false,
          };
        } catch (error) {
          const errorMessage = axios.isAxiosError(error)
            ? `API Error: ${error.response?.data?.message || error.message}`
            : `Error: ${error instanceof Error ? error.message : String(error)}`;

          return {
            content: [{ type: 'text', text: errorMessage }],
            isError: true,
          };
        }
      }

      case 'rocketreach_find_phone': {
        if (!isFindPhoneParams(args)) {
          throw new McpError(
            ErrorCode.InvalidParams,
            'Invalid arguments for rocketreach_find_phone. You must provide at least one of: name, first_name+last_name, or linkedin_url.'
          );
        }

        try {
          // First, search for the person
          const searchParams: any = {};
          
          if (args.name) {
            searchParams.name = args.name;
          } else if (args.first_name && args.last_name) {
            searchParams.first_name = args.first_name;
            searchParams.last_name = args.last_name;
          }
          
          if (args.company) {
            searchParams.current_employer = args.company;
          }
          
          if (args.title) {
            searchParams.current_title = args.title;
          }
          
          if (args.linkedin_url) {
            searchParams.linkedin_url = args.linkedin_url;
          }
          
          const response = await withRetry(
            async () => apiClient.post('/lookupProfile', searchParams),
            'find phone'
          );
          
          // Filter the response to only include phone numbers
          const data = response.data;
          const filteredData = {
            id: data.id,
            name: data.name,
            phones: data.phones || []
          };

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(filteredData, null, 2),
              },
            ],
            isError: false,
          };
        } catch (error) {
          const errorMessage = axios.isAxiosError(error)
            ? `API Error: ${error.response?.data?.message || error.message}`
            : `Error: ${error instanceof Error ? error.message : String(error)}`;

          return {
            content: [{ type: 'text', text: errorMessage }],
            isError: true,
          };
        }
      }

      default:
        return {
          content: [
            { type: 'text', text: `Unknown tool: ${name}` },
          ],
          isError: true,
        };
    }
  } catch (error) {
    // Log detailed error information
    safeLog('error', {
      message: `Request failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
      tool: request.params.name,
      arguments: request.params.arguments,
      timestamp: new Date().toISOString(),
      duration: Date.now() - startTime,
    });
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  } finally {
    // Log request completion with performance metrics
    safeLog('info', `Request completed in ${Date.now() - startTime}ms`);
  }
});

// Server startup
async function runServer() {
  try {
    console.error('Initializing RocketReach MCP Server...');

    const transport = new StdioServerTransport();

    // Detect if we're using stdio transport
    isStdioTransport = transport instanceof StdioServerTransport;
    if (isStdioTransport) {
      console.error(
        'Running in stdio mode, logging will be directed to stderr'
      );
    }

    await server.connect(transport);

    // Now that we're connected, we can send logging messages
    safeLog('info', 'RocketReach MCP Server initialized successfully');
    safeLog(
      'info',
      `Configuration: API URL: ${ROCKETREACH_API_URL}`
    );

    console.error('RocketReach MCP Server running on stdio');
  } catch (error) {
    console.error('Fatal error running server:', error);
    process.exit(1);
  }
}

runServer().catch((error: any) => {
  console.error('Fatal error running server:', error);
  process.exit(1);
});
