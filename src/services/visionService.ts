import axios from 'axios';
import Anthropic from '@anthropic-ai/sdk';
import { DeviceIdentification, VisionServiceResponse } from './types';

export class VisionService {
  private openaiApiKey: string;
  private anthropicApiKey: string;
  private anthropicClient?: Anthropic;

  constructor() {
    this.openaiApiKey = process.env.OPENAI_API_KEY || '';
    this.anthropicApiKey = process.env.ANTHROPIC_API_KEY || '';

    if (this.anthropicApiKey) {
      this.anthropicClient = new Anthropic({
        apiKey: this.anthropicApiKey,
      });
    }

    if (!this.openaiApiKey && !this.anthropicApiKey) {
      console.warn('No AI API keys set - vision services will return mock data');
    }
  }

  async identifyDevice(imageBuffer: Buffer): Promise<VisionServiceResponse> {
    const identifications: DeviceIdentification[] = [];

    if (this.anthropicClient) {
      try {
        const anthropicResult = await this.identifyWithAnthropic(imageBuffer);
        if (anthropicResult) {
          identifications.push(anthropicResult);
        }
      } catch (error) {
        console.warn('Anthropic vision failed:', error);
      }
    }

    if (this.openaiApiKey && identifications.length === 0) {
      try {
        const openaiResult = await this.identifyWithOpenAI(imageBuffer);
        if (openaiResult) {
          identifications.push(openaiResult);
        }
      } catch (error) {
        console.warn('OpenAI vision failed:', error);
      }
    }

    if (identifications.length === 0) {
      identifications.push({
        name: 'IKEA BILLY Bookshelf',
        category: 'furniture',
        brand: 'IKEA',
        model: 'BILLY',
        confidence: 0.85,
        description: 'Mock identification: IKEA BILLY bookshelf (demo mode - set ANTHROPIC_API_KEY or OPENAI_API_KEY for real vision)'
      });
    }

    if (identifications.length === 0) {
      identifications.push({
        name: 'Unknown Device',
        category: 'general',
        confidence: 0.1,
        description: 'Unable to identify the device. Please provide more details or try a clearer image.'
      });
    }

    return {
      identifications: identifications.sort((a, b) => b.confidence - a.confidence),
      rawResponse: { identifications }
    };
  }

  private async identifyWithAnthropic(imageBuffer: Buffer): Promise<DeviceIdentification | null> {
    if (!this.anthropicClient) return null;

    const base64Image = imageBuffer.toString('base64');

    try {
      const message = await this.anthropicClient.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 500,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Analyze this image and identify the device, furniture, or object that might need assembly or repair instructions.

Please provide a JSON response with:
- name: specific product name if identifiable
- category: general category (furniture, electronics, appliance, etc.)
- model: model number if visible
- brand: brand name if identifiable
- confidence: confidence score 0-1
- description: detailed description of what you see

Focus on items that people commonly need instructions for. If you see IKEA furniture, try to identify the specific product line (e.g., BILLY bookshelf, MALM dresser, KALLAX shelf unit).`
              },
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/jpeg',
                  data: base64Image
                }
              }
            ]
          }
        ]
      });

      const content = message.content[0];
      if (content.type !== 'text') return null;

      try {
        const result = JSON.parse(content.text);
        return {
          name: result.name || 'Unknown Device',
          category: result.category || 'general',
          model: result.model,
          brand: result.brand,
          confidence: Math.min(Math.max(result.confidence || 0.7, 0), 1),
          description: result.description || 'Device identified via Anthropic Claude vision'
        };
      } catch (parseError) {
        const text = content.text;
        return {
          name: text.includes('IKEA') ? 'IKEA Furniture' : 'Identified Object',
          category: text.toLowerCase().includes('furniture') ? 'furniture' : 'general',
          confidence: 0.75,
          description: text.substring(0, 200)
        };
      }
    } catch (error) {
      console.warn('Anthropic API error:', error);
      return null;
    }
  }

  private async identifyWithOpenAI(imageBuffer: Buffer): Promise<DeviceIdentification | null> {
    const base64Image = imageBuffer.toString('base64');

    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Analyze this image and identify the device, furniture, or object. Focus on items that might need assembly or repair instructions.

Return a JSON response with:
- name: specific product name if identifiable
- category: general category (furniture, electronics, appliance, etc.)
- model: model number if visible
- brand: brand name if identifiable
- confidence: confidence score 0-1
- description: detailed description of what you see

If you see IKEA furniture, try to identify the specific product line (e.g., BILLY bookshelf, MALM dresser).`
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${base64Image}`
                }
              }
            ]
          }
        ],
        max_tokens: 500
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

    try {
      const result = JSON.parse(content);
      return {
        name: result.name || 'Unknown',
        category: result.category || 'general',
        model: result.model,
        brand: result.brand,
        confidence: Math.min(Math.max(result.confidence || 0.5, 0), 1),
        description: result.description || 'Device identified via OpenAI vision'
      };
    } catch (error) {
      return {
        name: content.includes('IKEA') ? 'IKEA Furniture' : 'Identified Object',
        category: 'furniture',
        confidence: 0.7,
        description: content.substring(0, 200)
      };
    }
  }

}