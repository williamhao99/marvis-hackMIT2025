/**
 * Marvis - AI-Powered Handyman Assistant
 *
 * Provides hands-free assembly guidance through smart glasses using barcode scanning,
 * AI-powered instruction parsing, and voice navigation.
 */

import { AppServer, AppSession, TranscriptionData, ViewType, ToolCall } from "@mentra/sdk"
import axios from "axios"
import path from 'path'
import { setupExpressRoutes } from './webview'
import { HandymanService } from './services/handymanService'
import { DataIngestionService } from './services/dataIngestionService'
import { SessionManager } from './services/sessionManager'
import { BarcodeService } from './services/barcodeService'
import { config } from './config'
import { Logger } from './utils/logger'
import type { InstructionStep, Project } from './types'

const logger = Logger.createLogger('Core')

const PACKAGE_NAME = config.packageName
const MENTRAOS_API_KEY = config.mentraApiKey
const CEREBRAS_API_KEY = config.cerebrasApiKey
const SERPAPI_KEY = config.serpapiKey
const EXA_API_KEY = config.exaApiKey
const ANTHROPIC_API_KEY = config.anthropicApiKey
const PORT = config.port
const S3_BUCKET_URL = config.s3BucketUrl

let CURRENT_BARCODE: string | null = null

logger.info(`Marvis starting on port ${PORT}`)
logger.info(`Package: ${PACKAGE_NAME}`)

if (ANTHROPIC_API_KEY) {
  logger.info(`Anthropic API key configured`)
} else {
  logger.warn("Anthropic API key not found - will use fallback instructions")
}

/**
 * Generates AR-optimized assembly instructions from PDF manuals using Anthropic Claude.
 * Falls back to generic instructions if API is unavailable.
 */
async function generateInstructionsFromPDF(productTitle: string, pdfUrl: string): Promise<InstructionStep[]> {
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ||
                           process.env.CLAUDE_API_KEY ||
                           process.env.ANTHROPIC_KEY

  if (!ANTHROPIC_API_KEY) {
    console.warn("Anthropic API key not available, using fallback instructions")
    console.warn("Set ANTHROPIC_API_KEY, CLAUDE_API_KEY, or ANTHROPIC_KEY in your .env file")
    return generateFallbackInstructions(productTitle)
  }

  try {
    console.log(`Generating instructions for ${productTitle} from PDF: ${pdfUrl}`)
    console.log(`Using API key: ${ANTHROPIC_API_KEY.substring(0, 8)}...`)

    const prompt = `You are an expert at extracting and formatting assembly instructions.

Product: ${productTitle}
PDF Manual URL: ${pdfUrl}

Carefully analyze the provided PDF manual and generate assembly steps that **match the actual instructions from the PDF** as closely as possible. Do not invent stepsonly use what is in the manual. Rephrase them to be concise and action-oriented, but preserve the original meaning and order.

Each step must be:
- Based directly on the PDF instructions
- Concise (fit on smart glasses display)
- Action-oriented
- Include specific details
- Have helpful tips (from the manual if available, otherwise infer from the step)

Return a JSON array of instruction steps with this exact format:
[
  {
    "id": 1,
    "title": "Step title (3-5 words)",
    "description": "Brief description (10-15 words)",
    "details": ["Detail 1", "Detail 2", "Detail 3"],
    "tips": "Helpful tip for this step"
  }
]

Return ONLY the JSON array, no other text.`


    const response = await axios.post('https://api.anthropic.com/v1/messages', {
      model: "claude-3-haiku-20240307",
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    }, {
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      }
    })

    const content = response.data.content[0].text
    const jsonMatch = content.match(/\[[\s\S]*\]/)
    if (jsonMatch) {
      const steps = JSON.parse(jsonMatch[0])
      console.log(`Generated ${steps.length} instruction steps using Anthropic API`)

      console.log('Generated Steps:')
      steps.forEach((step: InstructionStep, index: number) => {
        console.log(`  ${index + 1}. ${step.title}: ${step.description}`)
        if (step.details) {
          step.details.forEach(detail => console.log(`     - ${detail}`))
        }
        if (step.tips) {
          console.log(`     ${step.tips}`)
        }
      })

      return steps
    } else {
      console.warn("No JSON found in Anthropic response, using fallback")
    }
  } catch (error: any) {
    if (error.response?.status === 401) {
      console.error('Anthropic API authentication failed - check your API key')
      console.error('Make sure your API key is valid and starts with "sk-ant-"')
    } else if (error.response?.status === 429) {
      console.error('Anthropic API rate limit exceeded - please wait')
    } else {
      console.error('Error generating instructions with Anthropic:', error.message)
    }
  }

  return generateFallbackInstructions(productTitle)
}

function generateFallbackInstructions(productTitle: string): InstructionStep[] {
  const isLego = productTitle.toLowerCase().includes('lego')
  const isFurniture = productTitle.toLowerCase().includes('shelf') ||
                      productTitle.toLowerCase().includes('table') ||
                      productTitle.toLowerCase().includes('desk') ||
                      productTitle.toLowerCase().includes('chair')

  if (isLego) {
    return [
      {
        id: 1,
        title: "Open & Sort",
        description: "Open package and organize pieces",
        details: ["Open all bags", "Sort by color/size", "Check piece count"],
        tips: "Use small bowls to organize pieces"
      },
      {
        id: 2,
        title: "Follow Instructions",
        description: "Start with step 1 of the manual",
        details: ["Locate first pieces", "Connect as shown", "Check orientation"],
        tips: "Work on a flat surface"
      },
      {
        id: 3,
        title: "Build Base",
        description: "Complete the foundation",
        details: ["Connect base pieces", "Ensure stability", "Check alignment"],
        tips: "Press pieces firmly together"
      },
      {
        id: 4,
        title: "Add Details",
        description: "Attach smaller components",
        details: ["Add decorative pieces", "Attach moving parts", "Check connections"],
        tips: "Don't force pieces"
      },
      {
        id: 5,
        title: "Final Assembly",
        description: "Complete the model",
        details: ["Add final pieces", "Check all connections", "Compare to image"],
        tips: "Display proudly!"
      }
    ]
  } else if (isFurniture) {
    return [
      {
        id: 1,
        title: "Unpack All Parts",
        description: "Remove and organize components",
        details: ["Lay out all pieces", "Check parts list", "Organize hardware"],
        tips: "Keep packaging until complete"
      },
      {
        id: 2,
        title: "Prepare Tools",
        description: "Gather necessary tools",
        details: ["Check included tools", "Get screwdriver if needed", "Clear workspace"],
        tips: "Read all instructions first"
      },
      {
        id: 3,
        title: "Assemble Frame",
        description: "Build the main structure",
        details: ["Connect main panels", "Insert screws loosely", "Check alignment"],
        tips: "Don't fully tighten until aligned"
      },
      {
        id: 4,
        title: "Add Components",
        description: "Attach shelves or surfaces",
        details: ["Position components", "Secure with hardware", "Tighten all screws"],
        tips: "Work systematically"
      },
      {
        id: 5,
        title: "Final Steps",
        description: "Complete assembly",
        details: ["Add back panel if needed", "Attach anti-tip hardware", "Position in place"],
        tips: "Secure to wall for safety"
      }
    ]
  }

  return [
    {
      id: 1,
      title: "Preparation",
      description: "Unpack and organize",
      details: ["Open packaging", "Check all parts", "Read instructions"],
      tips: "Take your time"
    },
    {
      id: 2,
      title: "Initial Assembly",
      description: "Start main assembly",
      details: ["Begin with base", "Follow diagram", "Connect main parts"],
      tips: "Work on flat surface"
    },
    {
      id: 3,
      title: "Continue Building",
      description: "Add components",
      details: ["Attach additional parts", "Check connections", "Follow sequence"],
      tips: "Don't force connections"
    },
    {
      id: 4,
      title: "Final Assembly",
      description: "Complete the build",
      details: ["Add final pieces", "Tighten all connections", "Check stability"],
      tips: "Review all steps"
    },
    {
      id: 5,
      title: "Completion",
      description: "Finish and test",
      details: ["Verify assembly", "Test functionality", "Clean up"],
      tips: "Keep manual for reference"
    }
  ]
}

type AppState = 'welcome' | 'selecting' | 'building' | 'completed'

const projectCache = new Map<string, Project>()

async function identifyProductFromBarcode(barcode: string): Promise<string | null> {
  if (!CEREBRAS_API_KEY) {
    console.warn("Cerebras API key not available")
    return null
  }

  try {
    const prompt = `Create a simple search query for barcode ${barcode}. Use format: "${barcode} product" or "${barcode} LEGO". Return only one short line:`

    const response = await axios.post('https://api.cerebras.ai/v1/chat/completions', {
      model: "llama3.1-8b",
      messages: [
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: 50,
      temperature: 0.2
    }, {
      headers: {
        'Authorization': `Bearer ${CEREBRAS_API_KEY}`,
        'Content-Type': 'application/json'
      }
    })

    return response.data.choices[0]?.message?.content?.trim() || null
  } catch (error) {
    console.error('Error calling Cerebras API for product identification:', error)
    return null
  }
}

async function analyzeProductFromGoogleResults(barcode: string, googleResults: any): Promise<string | null> {
  if (!CEREBRAS_API_KEY) {
    console.warn("Cerebras API key not available")
    return null
  }

  if (!googleResults?.items?.length) {
    return null
  }

  try {
    const resultsText = googleResults.items.slice(0, 5).map((item: any, index: number) =>
      `${index + 1}. Title: ${item.title}
      URL: ${item.link}
      Snippet: ${item.snippet || 'No description available'}`
    ).join('\n\n')

    const prompt = `Analyze these Google search results for barcode "${barcode}" and provide a confident product identification.

Search Results:
${resultsText}

Based on these search results, what is the exact product name? Look for the most specific and complete product title that appears consistently across the results.

Respond with ONLY the product name, nothing else. Be confident and specific.`

    const response = await axios.post('https://api.cerebras.ai/v1/chat/completions', {
      model: "llama3.1-8b",
      messages: [
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: 100,
      temperature: 0.1
    }, {
      headers: {
        'Authorization': `Bearer ${CEREBRAS_API_KEY}`,
        'Content-Type': 'application/json'
      }
    })

    return response.data.choices[0]?.message?.content?.trim() || null
  } catch (error) {
    console.error('Error calling Cerebras API for product analysis:', error)
    return null
  }
}

async function generateInstructionQuery(voiceCommand: string, productTitle: string): Promise<string | null> {
  if (!CEREBRAS_API_KEY) {
    console.warn("Cerebras API key not available")
    return null
  }

  try {
    const prompt = `Create a specific search query for "${productTitle}" assembly instructions. Keep the brand name and main product details. Format: "[Brand] [Product Name] assembly instructions" or "[Brand] [Product Name] manual". Return only one line:`

    const response = await axios.post('https://api.cerebras.ai/v1/chat/completions', {
      model: "llama3.1-8b",
      messages: [
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: 50,
      temperature: 0.1
    }, {
      headers: {
        'Authorization': `Bearer ${CEREBRAS_API_KEY}`,
        'Content-Type': 'application/json'
      }
    })

    return response.data.choices[0]?.message?.content?.trim() || null
  } catch (error) {
    console.error('Error calling Cerebras API for instruction query:', error)
    return null
  }
}

async function searchWithGoogle(query: string): Promise<any> {
  if (!SERPAPI_KEY) {
    console.warn("SerpAPI key not available")
    return null
  }

  console.log(`Searching SerpAPI for: "${query}"`)

  try {
    const response = await axios.get('https://serpapi.com/search', {
      params: {
        engine: 'google',
        api_key: SERPAPI_KEY,
        q: query,
        num: 5
      }
    })

    console.log(`SerpAPI response status: ${response.status}`)

    const transformedResponse = {
      searchInformation: {
        totalResults: response.data.search_information?.total_results || 0
      },
      items: response.data.organic_results?.filter((result: any) =>
        !result.link?.includes('https://images.thdstatic.com')
      ).map((result: any) => ({
        title: result.title,
        link: result.link,
        snippet: result.snippet,
        displayLink: result.displayed_link
      })) || []
    }

    return transformedResponse
  } catch (error: any) {
    console.error('Error calling SerpAPI:', error.message)
    return null
  }
}

async function searchGoogleForPDFs(query: string): Promise<any> {
  if (!SERPAPI_KEY) {
    console.warn("SerpAPI key not available for PDF search")
    return null
  }

  const cleanQuery = query.replace(/['"]/g, '').trim()
  const pdfQuery = `${cleanQuery} filetype:pdf`
  console.log(`Searching SerpAPI for PDFs: "${pdfQuery}"`)

  try {
    const response = await axios.get('https://serpapi.com/search', {
      params: {
        engine: 'google',
        api_key: SERPAPI_KEY,
        q: pdfQuery,
        num: 10
      }
    })

    const transformedResponse = {
      searchInformation: {
        totalResults: response.data.search_information?.total_results || 0
      },
      items: response.data.organic_results?.filter((result: any) =>
        !result.link?.includes('https://images.thdstatic.com')
      ).map((result: any) => ({
        title: result.title,
        link: result.link,
        snippet: result.snippet,
        displayLink: result.displayed_link,
        fileFormat: result.link?.toLowerCase().includes('.pdf') ? 'PDF' : undefined,
        mime: result.link?.toLowerCase().includes('.pdf') ? 'application/pdf' : undefined
      })) || []
    }

    return transformedResponse
  } catch (error: any) {
    console.error('Error calling SerpAPI for PDFs:', error.message)
    return null
  }
}

function findFirstValidPDF(searchResults: any): any {
  if (!searchResults?.items?.length) {
    console.log('No search results to process')
    return null
  }

  for (const item of searchResults.items) {
    const url = item.link || ''
    const title = item.title || ''
    const fileFormat = item.fileFormat || ''
    const mimeType = item.mime || ''

    console.log(`� Checking result: "${title}"`)

    const isPDF =
      url.toLowerCase().endsWith('.pdf') ||
      url.toLowerCase().includes('.pdf') ||
      fileFormat?.toLowerCase().includes('pdf') ||
      mimeType?.toLowerCase().includes('pdf') ||
      title.toLowerCase().includes('pdf') ||
      url.includes('rebrickable.com/instructions/') ||
      url.includes('lego.com/service/buildinginstructions/') ||
      (title.toLowerCase().includes('instructions') && (
        url.includes('rebrickable.com') ||
        url.includes('brickset.com') ||
        url.includes('bricklink.com') ||
        title.toLowerCase().includes('lego')
      ))

    if (isPDF) {
      console.log(`Found valid PDF: "${title}"`)
      return {
        title: title,
        url: url,
        snippet: item.snippet || 'PDF instruction manual',
        fileFormat: fileFormat,
        mimeType: mimeType
      }
    }
  }

  console.log('No valid PDF found in results')
  return null
}

async function searchWithExa(query: string): Promise<any> {
  if (!EXA_API_KEY) {
    console.warn("Exa API key not available")
    return null
  }

  try {
    const response = await axios.post('https://api.exa.ai/search', {
      query: query,
      type: "neural",
      useAutoprompt: true,
      numResults: 3,
      contents: {
        text: true,
        highlights: true
      }
    }, {
      headers: {
        'x-api-key': EXA_API_KEY,
        'Content-Type': 'application/json'
      }
    })

    return response.data
  } catch (error) {
    return null
  }
}

async function uploadProjectToS3(project: Project, barcode: string, pdfUrl?: string): Promise<void> {
  try {
    const timestamp = new Date().toISOString()
    const fileName = "informationlive.json"
    const url = `${S3_BUCKET_URL}/${fileName}`

    const s3Data = {
      barcode: barcode,
      product_title: project.name,
      timestamp: timestamp,
      pdf_url: pdfUrl || null,
      project: project,
      metadata: {
        source: project.source,
        total_steps: project.totalSteps,
        generated_at: timestamp,
        pdf_processed: pdfUrl ? true : false
      }
    }

    const response = await axios.put(url, JSON.stringify(s3Data, null, 2), {
      headers: {
        'Content-Type': 'application/json'
      }
    })

    if (response.status === 200) {
      console.log(`Successfully uploaded project to S3!`)
      console.log(`Public URL: ${url}`)
    } else {
      console.log(`Upload response: ${response.status}`)
    }

  } catch (error: any) {
    console.error("Failed to upload to S3:", error.response?.status || error.message)
  }
}

/**
 * Orchestrates AI pipeline to generate assembly instructions from barcode scan.
 * Coordinates Cerebras (product ID), SerpAPI (manual search), and Anthropic (instruction parsing).
 * Implements caching and fallbacks for robustness.
 */
async function processVoiceCommandWithAI(voiceCommand: string, barcode: string, session?: AppSession): Promise<Project | null> {
  console.log(`Processing voice command with AI: "${voiceCommand}" + barcode: ${barcode}`)

  const cacheKey = `barcode_${barcode}`
  if (projectCache.has(cacheKey)) {
    console.log(`Using cached project for barcode: ${barcode}`)
    const cachedProject = projectCache.get(cacheKey)!

    console.log('Cached Steps:')
    cachedProject.steps.forEach((step: InstructionStep, index: number) => {
      console.log(`  ${index + 1}. ${step.title}: ${step.description}`)
      if (step.details) {
        step.details.forEach(detail => console.log(`     - ${detail}`))
      }
      if (step.tips) {
        console.log(`     ${step.tips}`)
      }
    })

    return cachedProject
  }

  try {
    console.log(`Step 1: Identifying product for barcode ${barcode}`)
    const productIdQuery = await identifyProductFromBarcode(barcode)
    if (!productIdQuery) {
      console.log(`Failed to generate product identification query`)
      return null
    }

    console.log(`Product identification query: "${productIdQuery}"`)

    let productSearchResults = await searchWithGoogle(productIdQuery)

    if (!productSearchResults || !productSearchResults.items || productSearchResults.items.length === 0) {
      console.log(`Primary search failed, trying fallback searches...`)

      const fallbackQueries = [
        `${barcode} product`,
        `UPC ${barcode}`,
        `barcode ${barcode}`,
        `${barcode}`
      ]

      for (const fallbackQuery of fallbackQueries) {
        console.log(`� Trying fallback: "${fallbackQuery}"`)
        productSearchResults = await searchWithGoogle(fallbackQuery)

        if (productSearchResults?.items && productSearchResults.items.length > 0) {
          console.log(`Fallback search successful with: "${fallbackQuery}"`)
          break
        }

        await new Promise(resolve => setTimeout(resolve, 500))
      }
    }

    if (!productSearchResults || !productSearchResults.items || productSearchResults.items.length === 0) {
      console.log(`SerpAPI failed, trying Exa search...`)
      const exaResults = await searchWithExa(productIdQuery)
      if (!exaResults || !exaResults.results || exaResults.results.length === 0) {
        console.log(`All search attempts failed for barcode ${barcode}`)
        return null
      }

      const firstResult = exaResults.results[0]
      const project: Project = {
        id: `barcode_${barcode}`,
        name: firstResult.title || productIdQuery,
        totalSteps: 3,
        source: 'barcode',
        steps: [
          {
            id: 1,
            title: "Preparation",
            description: "Gather tools and check components",
            details: ["Check all parts are present", "Gather required tools"],
            tips: firstResult.highlights ? firstResult.highlights[0] : "Follow manufacturer guidelines"
          },
          {
            id: 2,
            title: "Assembly",
            description: "Follow the main assembly steps",
            details: ["Follow instructions carefully", "Take your time"],
            tips: "Reference: " + firstResult.url
          },
          {
            id: 3,
            title: "Completion",
            description: "Final checks and cleanup",
            details: ["Verify all connections", "Clean up workspace"],
            tips: "Product identified via barcode scan"
          }
        ]
      }
      return project
    }

    console.log(`Analyzing results with Cerebras for confident identification...`)
    const productTitle = await analyzeProductFromGoogleResults(barcode, productSearchResults)
    if (!productTitle) {
      console.log(`Could not identify product from search results`)
      return null
    }

    console.log(`Cerebras identified product: "${productTitle}"`)

    if (session) {
      const identificationText = [
        "PRODUCT IDENTIFIED",
        "",
        `${productTitle}`,
        "",
        `Barcode: ${barcode}`,
        "",
        "Processing instructions..."
      ].join("\n")

      session.layouts.showTextWall(identificationText, {
        view: ViewType.MAIN,
        durationMs: 5000
      })
    }

    console.log(`Step 2: Generating instruction query for "${productTitle}"`)
    const instructionQuery = await generateInstructionQuery(voiceCommand, productTitle)
    if (!instructionQuery) {
      console.log(`Failed to generate instruction query`)
      return null
    }

    console.log(`Instruction query: "${instructionQuery}"`)

    let instructionResults = await searchGoogleForPDFs(instructionQuery)

    if (!instructionResults || !instructionResults.items?.length) {
      console.log(`PDF search failed, trying regular search...`)
      instructionResults = await searchWithGoogle(instructionQuery)
    }

    if (instructionResults && instructionResults.items?.length > 0) {
      const firstPDF = findFirstValidPDF(instructionResults)

      if (firstPDF) {
        console.log(`Found PDF/instruction manual: ${firstPDF.title}`)

        const steps = await generateInstructionsFromPDF(productTitle, firstPDF.url)

        const project: Project = {
          id: `barcode_${barcode}`,
          name: productTitle,
          totalSteps: steps.length,
          source: 'barcode',
          steps: steps
        }

        projectCache.set(`barcode_${barcode}`, project)
        console.log(`Cached project: ${project.name}`)

        await uploadProjectToS3(project, barcode, firstPDF.url)

        if (session) {
          const finalText = [
            "INSTRUCTIONS FOUND",
            "",
            `${productTitle}`,
            "",
            `${firstPDF.title}`,
            "",
            "Ready to guide you!"
          ].join("\n")

          session.layouts.showTextWall(finalText, {
            view: ViewType.MAIN,
            durationMs: 5000
          })
        }

        return project
      }
    }

    console.log(`No PDF found, generating generic instructions`)
    const steps = await generateInstructionsFromPDF(productTitle, "")

    const project: Project = {
      id: `barcode_${barcode}`,
      name: productTitle,
      totalSteps: steps.length,
      source: 'barcode',
      steps: steps
    }

    projectCache.set(`barcode_${barcode}`, project)
    console.log(`Cached fallback project: ${project.name}`)

    await uploadProjectToS3(project, barcode)

    return project
  } catch (error) {
    console.error('Error processing with AI:', error)
    return null
  }
}

class EnhancedHandymanAssistant extends AppServer {
  private sessions: Map<string, {
    state: AppState
    currentProject?: Project
    currentStep: number
    startTime: number
    availableProjects: Map<string, Project>
    stepsGenerated: boolean
  }> = new Map()

  private transcriptionCleanups = new Map<string, () => void>()
  private handymanService: HandymanService
  private dataIngestionService: DataIngestionService
  private sessionManager: SessionManager
  private barcodeService: BarcodeService

  constructor() {
    super({
      packageName: PACKAGE_NAME,
      apiKey: MENTRAOS_API_KEY!, // Non-null assertion since we validate above
      port: PORT,
      publicDir: path.join(__dirname, '../public'),
    })

    this.handymanService = new HandymanService()
    this.dataIngestionService = new DataIngestionService()
    this.sessionManager = new SessionManager()
    this.barcodeService = new BarcodeService()

    setupExpressRoutes(this)
  }

  protected async onSession(
    session: AppSession,
    sessionId: string,
    userId: string
  ): Promise<void> {
    console.log(`
=======================================
� NEW SESSION CONNECTED!
Session ID: ${sessionId}
User ID: ${userId}
Time: ${new Date().toISOString()}
=======================================
    `)
    session.logger.info(`New session started for user ${userId}`)

    const availableProjects = new Map<string, Project>()

    this.sessions.set(sessionId, {
      state: 'welcome',
      currentStep: 0,
      startTime: Date.now(),
      availableProjects,
      stepsGenerated: false
    })

    this.loadS3Data(sessionId)
    await this.setupVoiceTranscription(session, sessionId, userId)
    await this.updateCurrentBarcode()
    this.showWelcomeScreen(session)
  }

  private async loadS3Data(sessionId: string): Promise<void> {
    try {
      const s3Data = await this.dataIngestionService.fetchProductData()
      if (s3Data) {
        const sessionData = this.sessions.get(sessionId)
        if (sessionData) {
          const s3Project: Project = {
            id: 's3_product',
            name: `${s3Data.product.name} (${s3Data.product.brand})`,
            totalSteps: s3Data.instruction_manual.steps.length,
            source: 's3',
            steps: s3Data.instruction_manual.steps.map((step, index) => ({
              id: index + 1,
              title: `Step ${step.step_number}`,
              description: step.description,
              details: step.parts_used,
              tips: s3Data.instruction_manual.safety_warnings[0] || "Follow safety guidelines"
            }))
          }
          sessionData.availableProjects.set('s3_product', s3Project)
          console.log('S3 product loaded:', s3Project.name)
        }
      }
    } catch (error) {
      console.error('Failed to load S3 data:', error)
    }
  }

  protected async onToolCall(toolCall: ToolCall): Promise<string | undefined> {
    const session = this.sessions.get(toolCall.userId)
    if (!session) {
      return "Please start a session first."
    }

    console.log(`Tool called: ${toolCall.toolId}`)

    switch (toolCall.toolId) {
      case "identify_device":
        const s3Device = await this.dataIngestionService.getDeviceIdentification()
        if (s3Device) {
          return `Identified: ${s3Device.name} - ${s3Device.description}`
        }
        return "Could not identify device. Please try voice commands."

      case "next_step":
        const nextSession = this.sessions.get(toolCall.userId)
        if (nextSession?.currentProject) {
          if (nextSession.currentStep < nextSession.currentProject.totalSteps - 1) {
            nextSession.currentStep++
            return `Step ${nextSession.currentStep + 1}: ${nextSession.currentProject.steps[nextSession.currentStep].description}`
          }
        }
        return "No more steps available."

      case "previous_step":
        const prevSession = this.sessions.get(toolCall.userId)
        if (prevSession?.currentProject && prevSession.currentStep > 0) {
          prevSession.currentStep--
          return `Step ${prevSession.currentStep + 1}: ${prevSession.currentProject.steps[prevSession.currentStep].description}`
        }
        return "Already at the first step."

      default:
        return `Unknown tool: ${toolCall.toolId}`
    }
  }

  protected async onStop(sessionId: string, userId: string, reason: string): Promise<void> {
    this.sessions.delete(sessionId)
    const cleanup = this.transcriptionCleanups.get(sessionId)
    if (cleanup) {
      cleanup()
      this.transcriptionCleanups.delete(sessionId)
    }
  }

  private async setupVoiceTranscription(
    session: AppSession,
    sessionId: string,
    userId: string
  ): Promise<void> {
    try {
      const transcriptionHandler = (data: TranscriptionData) => {
        this.handleVoiceTranscription(session, sessionId, userId, data)
      }

      const cleanup = session.onTranscriptionForLanguage('en-US', transcriptionHandler)
      this.transcriptionCleanups.set(sessionId, cleanup)
    } catch (error) {
      console.error('Error setting up voice transcription:', error)
    }
  }

  private async handleVoiceTranscription(
    session: AppSession,
    sessionId: string,
    userId: string,
    transcriptionData: TranscriptionData
  ): Promise<void> {
    const state = this.sessions.get(sessionId)
    if (!state) return

    if (!transcriptionData.isFinal) return

    const command = transcriptionData.text?.toLowerCase().trim()
    if (!command) return

    console.log(`Voice command: "${command}" (state: ${state.state})`)

    if (state.state === 'building') {
      if (command.includes('next') || command.includes('continue') ||
          command.includes('back') || command.includes('previous') ||
          command.includes('repeat') || command.includes('again') ||
          command.includes('start over') || command.includes('restart')) {
        console.log('Processing navigation command directly')
        this.processVoiceCommand(session, sessionId, command)
        return
      }
    }

    if (state.state === 'welcome' && !state.stepsGenerated) {
      console.log('Starting AI processing for barcode...')
      try {
        await this.updateCurrentBarcode()
        if (!CURRENT_BARCODE) {
          console.error('No barcode available')
          return
        }
        const aiProject = await processVoiceCommandWithAI(command, CURRENT_BARCODE, session)
        if (aiProject && state) {
          state.availableProjects.set(aiProject.id, aiProject)
          state.stepsGenerated = true
          this.sessions.set(sessionId, state)

          console.log('AI-generated project added:', aiProject.name)
          console.log('Auto-starting generated project...')
          this.handleProjectSelection(session, sessionId, aiProject.id)
        }
      } catch (error) {
        console.error('Error processing barcode:', error)
      }
    } else if (state.state === 'welcome' && state.stepsGenerated) {
      console.log('Steps already generated, ignoring voice command')
    }

    this.processVoiceCommand(session, sessionId, command)
  }

  private processVoiceCommand(session: AppSession, sessionId: string, command: string): void {
    const state = this.sessions.get(sessionId)
    if (!state) return

    if (state.state === 'welcome') {
      session.layouts.showTextWall([
        "SCANNING BARCODE",
        "",
        `${CURRENT_BARCODE || "Fetching..."}`,
        "",
        "Searching for product...",
        "Generating instructions..."
      ].join("\n"), {
        view: ViewType.MAIN,
        durationMs: undefined
      })
      return
    }

    if (state.state === 'selecting') {
      if (CURRENT_BARCODE && state.availableProjects.has(`barcode_${CURRENT_BARCODE}`)) {
        this.handleProjectSelection(session, sessionId, `barcode_${CURRENT_BARCODE}`)
        return
      }
      else if (state.availableProjects.has('s3_product')) {
        this.handleProjectSelection(session, sessionId, 's3_product')
        return
      }
    }

    if (state.state === 'building' && state.currentProject) {
      console.log(`Navigation command in building mode: "${command}"`)

      if (command.includes('next') || command.includes('continue') || command.includes('forward')) {
        console.log('Next step requested')
        this.handleNextStep(session, sessionId)
        return
      }
      else if (command.includes('back') || command.includes('previous') || command.includes('last')) {
        console.log('Previous step requested')
        this.handlePreviousStep(session, sessionId)
        return
      }
      else if (command.includes('repeat') || command.includes('again') || command.includes('what')) {
        console.log('Repeat step requested')
        this.showInstructionStep(session, state.currentProject, state.currentStep)
        return
      }
      else if (command.includes('start over') || command.includes('restart') || command.includes('beginning')) {
        console.log('Restart requested')
        state.currentStep = 0
        this.showInstructionStep(session, state.currentProject, state.currentStep)
        this.sessions.set(sessionId, state)
        return
      }
    }

    if (state.state === 'completed') {
      if (command.includes('new') || command.includes('another') || command.includes('different')) {
        this.handleNewProject(session, sessionId)
        return
      }
    }
  }

  private showWelcomeScreen(session: AppSession): void {
    const barcodeDisplay = CURRENT_BARCODE || "Fetching..."
    session.layouts.showTextWall([
      "MARVIS",
      "AI Handyman Assistant",
      "",
      `Barcode: ${barcodeDisplay}`,
      "Say anything to scan"
    ].join("\n"), {
      view: ViewType.MAIN,
      durationMs: undefined
    })
  }

  private showProjectSelection(session: AppSession, state: any): void {
    if (state.availableProjects.size === 0) {
      session.layouts.showTextWall([
        "SEARCHING...",
        "",
        "Looking for instructions",
        `Barcode: ${CURRENT_BARCODE || "Fetching..."}`,
        "",
        "Please wait..."
      ].join("\n"), {
        view: ViewType.MAIN,
        durationMs: undefined
      })
      return
    }

    const lines = ["PRODUCTS FOUND:"]

    state.availableProjects.forEach((project: Project) => {
      lines.push("")
      lines.push(`${project.name}`)
      lines.push(`Steps: ${project.totalSteps}`)
    })

    lines.push("")
    lines.push("Say 'start' to begin")

    session.layouts.showTextWall(lines.join("\n"), {
      view: ViewType.MAIN,
      durationMs: undefined
    })
  }

  private showInstructionStep(session: AppSession, project: Project, stepIndex: number): void {
    const step = project.steps[stepIndex]

    console.log(`Displaying step ${stepIndex + 1}/${project.totalSteps}: ${step.title}`)

    const basicContent = [
      `Step ${step.id}/${project.totalSteps}`,
      `${step.title}`,
      "",
      `${step.description}`
    ]

    if (step.details && step.details.length > 0) {
      basicContent.push("")
      step.details.forEach((detail, index) => {
        basicContent.push(`${index + 1}. ${detail}`)
      })
    }

    if (step.tips) {
      basicContent.push("")
      basicContent.push(`Tip: ${step.tips}`)
    }

    basicContent.push("")
    basicContent.push("Say 'next' or 'back'")

    const basicText = basicContent.join("\n")
    console.log(`Basic format (${basicText.length} chars, ${basicContent.length} lines)`)
    console.log("Full content being sent:")
    console.log(basicText)
    console.log("==================")

    session.layouts.showTextWall(basicText, {
      view: ViewType.MAIN,
      durationMs: undefined
    })

    setTimeout(() => {
      const minimalContent = [
        `Step ${step.id}: ${step.title}`,
        "",
        step.description,
        "",
        "Say 'next' to continue"
      ]

      const minimalText = minimalContent.join("\n")
      console.log(`Minimal fallback (${minimalText.length} chars)`)
      console.log("Minimal content:")
      console.log(minimalText)

      session.layouts.showTextWall(minimalText, {
        view: ViewType.MAIN,
        durationMs: undefined
      })
    }, 2000)
  }

  private createProgressBar(current: number, total: number): string {
    const filled = Math.round((current / total) * 10)
    const empty = 10 - filled
    return `[${'='.repeat(filled)}${' '.repeat(empty)}] ${current}/${total}`
  }

  private showCompletionScreen(session: AppSession, sessionId: string, project: Project): void {
    const sessionData = this.sessions.get(sessionId)
    const timeElapsed = sessionData ? Math.round((Date.now() - sessionData.startTime) / 60000) : 0

    session.layouts.showTextWall([
      "COMPLETE!",
      `${project.name} done`,
      `Time: ${timeElapsed} minutes`,
      "",
      "Say 'new project'"
    ].join("\n"), {
      view: ViewType.MAIN,
      durationMs: undefined
    })
  }

  private handleNextStep(session: AppSession, sessionId: string): void {
    const state = this.sessions.get(sessionId)
    if (!state || !state.currentProject) {
      console.error('handleNextStep: No state or project found')
      return
    }

    console.log(`Moving from step ${state.currentStep + 1} to ${state.currentStep + 2} (total: ${state.currentProject.totalSteps})`)

    if (state.currentStep < state.currentProject.totalSteps - 1) {
      state.currentStep++
      this.sessions.set(sessionId, state)
      this.showInstructionStep(session, state.currentProject, state.currentStep)
    } else {
      state.state = 'completed'
      this.sessions.set(sessionId, state)
      this.showCompletionScreen(session, sessionId, state.currentProject)
    }
  }

  private handlePreviousStep(session: AppSession, sessionId: string): void {
    const state = this.sessions.get(sessionId)
    if (!state || !state.currentProject || state.currentStep <= 0) return

    state.currentStep--
    this.showInstructionStep(session, state.currentProject, state.currentStep)
    this.sessions.set(sessionId, state)
  }

  private handleNewProject(session: AppSession, sessionId: string): void {
    const state = this.sessions.get(sessionId)
    if (!state) return

    state.state = 'selecting'
    state.currentStep = 0
    state.currentProject = undefined
    state.startTime = Date.now()
    state.stepsGenerated = false
    this.showProjectSelection(session, state)

    this.sessions.set(sessionId, state)
  }

  private handleProjectSelection(session: AppSession, sessionId: string, projectId: string): void {
    const state = this.sessions.get(sessionId)
    if (!state) {
      console.error('No session state found for:', sessionId)
      return
    }

    const project = state.availableProjects.get(projectId)
    if (!project) {
      console.warn('Unknown project ID:', projectId)
      return
    }

    state.state = 'building'
    state.currentProject = project
    state.currentStep = 0
    state.startTime = Date.now()
    this.sessions.set(sessionId, state)

    this.showInstructionStep(session, project, 0)
    console.log(`Started project: ${project.name} (${project.source})`)
  }

  private async updateCurrentBarcode(): Promise<void> {
    try {
      const barcode = await this.barcodeService.getCurrentBarcode()
      if (barcode && barcode !== CURRENT_BARCODE) {
        CURRENT_BARCODE = barcode
        console.log(`Updated current barcode: ${CURRENT_BARCODE}`)
      }
    } catch (error) {
      console.error('Error updating barcode:', error)
    }
  }
}

const server = new EnhancedHandymanAssistant()

server.start()
  .then(() => {
    console.log(`Marvis - AI Handyman Assistant running on port ${PORT}`)
    console.log(`Ready to connect to MentraOS glasses`)
    console.log(`Data sources: Hardcoded | S3 | Barcode API`)
    console.log(`Voice commands enabled via transcription API`)
    console.log(`AI processing: ${CEREBRAS_API_KEY ? 'Cerebras' : 'Cerebras'}`)
    console.log(`Search APIs: ${SERPAPI_KEY ? 'SerpAPI' : 'SerpAPI'} | ${EXA_API_KEY ? 'Exa' : 'Exa'}`)
    console.log(`Barcode: Dynamic from S3 (${CURRENT_BARCODE || 'fetching...'})`)
    console.log(`S3 data ingestion enabled`)
  })
  .catch((error) => {
    console.error("Failed to start server:", error)
    process.exit(1)
  })