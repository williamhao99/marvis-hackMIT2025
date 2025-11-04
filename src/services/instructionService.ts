import axios from 'axios';
import * as cheerio from 'cheerio';
import { InstructionManual, InstructionStep, InstructionSearchResult, DeviceIdentification } from './types';

export class InstructionService {
  private openaiApiKey: string;
  private manualCache = new Map<string, InstructionManual>();

  constructor() {
    this.openaiApiKey = process.env.OPENAI_API_KEY || '';
    if (!this.openaiApiKey) {
      console.warn('OPENAI_API_KEY not set - instruction service will use fallback methods');
    }
  }

  async findInstructions(device: DeviceIdentification): Promise<InstructionSearchResult[]> {
    const cacheKey = `${device.brand || ''}-${device.model || device.name}`.toLowerCase();

    if (this.manualCache.has(cacheKey)) {
      return [{
        manual: this.manualCache.get(cacheKey)!,
        score: 1.0,
        source: 'cache'
      }];
    }

    const results: InstructionSearchResult[] = [];

    try {
      if (device.brand?.toLowerCase() === 'ikea' || device.name.toLowerCase().includes('ikea')) {
        const ikeaResult = await this.searchIkeaInstructions(device);
        if (ikeaResult) results.push(ikeaResult);
      }

      const aiGeneratedResult = await this.generateInstructionsWithAI(device);
      if (aiGeneratedResult) results.push(aiGeneratedResult);

      const webResult = await this.searchWebInstructions(device);
      if (webResult) results.push(webResult);

    } catch (error) {
      console.warn('Error finding instructions:', error);
    }

    return results.sort((a, b) => b.score - a.score);
  }

  private async searchIkeaInstructions(device: DeviceIdentification): Promise<InstructionSearchResult | null> {
    try {
      const searchTerm = device.model || device.name.replace('IKEA', '').trim();
      const manual = await this.generateIkeaStyleInstructions(device, searchTerm);

      if (manual) {
        this.manualCache.set(`ikea-${searchTerm.toLowerCase()}`, manual);
        return {
          manual,
          score: 0.9,
          source: 'ikea-generated'
        };
      }
    } catch (error) {
      console.warn('IKEA instruction search failed:', error);
    }
    return null;
  }

  private async generateIkeaStyleInstructions(device: DeviceIdentification, searchTerm: string): Promise<InstructionManual | null> {
    if (!this.openaiApiKey) {
      return this.getMockIkeaInstructions(device, searchTerm);
    }

    const prompt = `Generate step-by-step assembly instructions for an IKEA furniture piece: ${device.name} (${searchTerm}).

Create instructions in this JSON format:
{
  "id": "ikea_${searchTerm.toLowerCase().replace(/\s/g, '_')}",
  "deviceName": "${device.name}",
  "deviceModel": "${searchTerm}",
  "brand": "IKEA",
  "type": "assembly",
  "difficulty": "medium",
  "estimatedTotalTime": 60,
  "tools": ["Phillips screwdriver", "Allen wrench (provided)", "Hammer"],
  "parts": [],
  "steps": [
    {
      "stepNumber": 1,
      "title": "Prepare workspace",
      "description": "Clear a flat surface and lay out all parts and hardware",
      "estimatedTime": 5,
      "warnings": ["Check all parts are included before starting"]
    }
  ]
}

Make the instructions specific, practical, and include common IKEA assembly patterns. Include 6-10 realistic steps.`;

    try {
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-4',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 1500,
          temperature: 0.3
        },
        {
          headers: {
            'Authorization': `Bearer ${this.openaiApiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const content = response.data.choices[0]?.message?.content;
      if (!content) return null;

      const manual = JSON.parse(content);
      manual.totalSteps = manual.steps?.length || 0;

      return manual as InstructionManual;
    } catch (error) {
      console.warn('Failed to generate IKEA instructions:', error);
      return this.getMockIkeaInstructions(device, searchTerm);
    }
  }

  private getMockIkeaInstructions(device: DeviceIdentification, searchTerm: string): InstructionManual {
    return {
      id: `ikea_${searchTerm.toLowerCase().replace(/\s/g, '_')}_demo`,
      deviceName: device.name,
      deviceModel: searchTerm,
      brand: 'IKEA',
      type: 'assembly',
      difficulty: 'medium',
      totalSteps: 6,
      estimatedTotalTime: 45,
      tools: ['Phillips screwdriver', 'Allen wrench (provided)', 'Hammer'],
      parts: ['Side panels (2)', 'Shelves (4)', 'Back panel (1)', 'Hardware bag'],
      steps: [
        {
          stepNumber: 1,
          title: 'Prepare workspace',
          description: 'Clear a flat surface and lay out all parts and hardware. Check all parts are included.',
          estimatedTime: 5,
          warnings: ['Keep small parts away from children']
        },
        {
          stepNumber: 2,
          title: 'Attach shelf pins',
          description: 'Insert shelf pins into the pre-drilled holes on the side panels at your desired shelf heights.',
          estimatedTime: 5,
          tools: ['Hands only']
        },
        {
          stepNumber: 3,
          title: 'Assemble the frame',
          description: 'Connect the two side panels using screws. Make sure the frame is square.',
          estimatedTime: 10,
          tools: ['Phillips screwdriver'],
          warnings: ['Do not fully tighten screws until assembly is complete']
        },
        {
          stepNumber: 4,
          title: 'Install shelves',
          description: 'Place shelves on the shelf pins. Ensure they are level and secure.',
          estimatedTime: 8,
        },
        {
          stepNumber: 5,
          title: 'Attach back panel',
          description: 'Position the back panel and secure with provided nails. This adds stability.',
          estimatedTime: 12,
          tools: ['Hammer']
        },
        {
          stepNumber: 6,
          title: 'Final adjustments',
          description: 'Tighten all screws, check stability, and adjust shelf positions if needed.',
          estimatedTime: 5,
          tools: ['Phillips screwdriver']
        }
      ]
    };
  }

  private async generateInstructionsWithAI(device: DeviceIdentification): Promise<InstructionSearchResult | null> {
    const instructionType = this.determineInstructionType(device);

    const prompt = `Generate ${instructionType} instructions for: ${device.name} (${device.description}).

Create detailed JSON instructions with this structure:
{
  "id": "generated_${Date.now()}",
  "deviceName": "${device.name}",
  "brand": "${device.brand || 'Generic'}",
  "type": "${instructionType}",
  "difficulty": "medium",
  "estimatedTotalTime": 30,
  "tools": [],
  "parts": [],
  "steps": [
    {
      "stepNumber": 1,
      "title": "Initial preparation",
      "description": "Detailed step description",
      "estimatedTime": 5,
      "tools": ["screwdriver"],
      "warnings": ["Safety warning if applicable"]
    }
  ]
}

Generate 5-8 practical, actionable steps. Include safety warnings where appropriate.`;

    try {
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-4',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 1200,
          temperature: 0.4
        },
        {
          headers: {
            'Authorization': `Bearer ${this.openaiApiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const content = response.data.choices[0]?.message?.content;
      if (!content) return null;

      const manual = JSON.parse(content);
      manual.totalSteps = manual.steps?.length || 0;

      const cacheKey = `${device.brand || 'generic'}-${device.name}`.toLowerCase();
      this.manualCache.set(cacheKey, manual);

      return {
        manual: manual as InstructionManual,
        score: 0.8,
        source: 'ai-generated'
      };
    } catch (error) {
      console.warn('Failed to generate AI instructions:', error);
      return null;
    }
  }

  private async searchWebInstructions(device: DeviceIdentification): Promise<InstructionSearchResult | null> {
    return {
      manual: {
        id: `web_${Date.now()}`,
        deviceName: device.name,
        brand: device.brand,
        type: 'assembly',
        difficulty: 'medium',
        totalSteps: 1,
        estimatedTotalTime: 15,
        tools: ['Basic tools'],
        parts: ['As provided'],
        steps: [{
          stepNumber: 1,
          title: 'Manual lookup required',
          description: `Please search for "${device.name} ${device.brand || ''} manual" online for specific instructions.`,
          estimatedTime: 15
        }]
      },
      score: 0.3,
      source: 'web-fallback'
    };
  }

  private determineInstructionType(device: DeviceIdentification): 'assembly' | 'repair' | 'maintenance' {
    const category = device.category.toLowerCase();
    const name = device.name.toLowerCase();

    if (category === 'furniture' || name.includes('assemble')) return 'assembly';
    if (name.includes('repair') || name.includes('fix')) return 'repair';
    if (name.includes('maintain') || name.includes('clean')) return 'maintenance';

    return 'assembly';
  }

  getInstructionStep(manual: InstructionManual, stepNumber: number): InstructionStep | null {
    if (stepNumber < 1 || stepNumber > manual.totalSteps) return null;
    return manual.steps.find(step => step.stepNumber === stepNumber) || null;
  }

  formatStepForDisplay(step: InstructionStep, manual: InstructionManual): string {
    let display = `Step ${step.stepNumber} of ${manual.totalSteps}\n\n`;
    display += `${step.title}\n\n`;
    display += `${step.description}`;

    if (step.estimatedTime) {
      display += `\n\nEstimated time: ${step.estimatedTime} minutes`;
    }

    if (step.tools && step.tools.length > 0) {
      display += `\n\nTools needed: ${step.tools.join(', ')}`;
    }

    if (step.warnings && step.warnings.length > 0) {
      display += `\n\n${step.warnings.join('\n')}`;
    }

    return display;
  }
}