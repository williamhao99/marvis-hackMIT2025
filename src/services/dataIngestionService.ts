import axios from 'axios';
import { DeviceIdentification, InstructionManual, InstructionStep } from './types';

interface S3ProductData {
  product: {
    id: string;
    name: string;
    brand: string;
    dimensions: {
      width_cm: number;
      depth_cm: number;
      height_cm: number;
    };
    color: string;
    material: string;
    weight_kg: number;
    shelves: number;
    price_usd: number;
  };
  instruction_manual: {
    tools_required: string[];
    assembly_time_minutes: number;
    safety_warnings: string[];
    steps: Array<{
      step_number: number;
      description: string;
      parts_used: string[];
    }>;
  };
}

export class DataIngestionService {
  private s3Url: string;
  private cachedData: S3ProductData | null = null;
  private lastFetch: Date | null = null;
  private cacheTimeout = 5 * 60 * 1000;

  constructor(s3Url: string = 'https://hackmit25.s3.us-east-1.amazonaws.com/test.json') {
    this.s3Url = s3Url;
  }

  async fetchProductData(): Promise<S3ProductData | null> {
    try {
      if (this.cachedData && this.lastFetch &&
          (Date.now() - this.lastFetch.getTime()) < this.cacheTimeout) {
        return this.cachedData;
      }

      console.log('Fetching product data from S3:', this.s3Url);
      const response = await axios.get(this.s3Url, {
        timeout: 10000,
        headers: {
          'Accept': 'application/json'
        }
      });

      this.cachedData = response.data;
      this.lastFetch = new Date();

      console.log('Successfully fetched product data:', this.cachedData?.product?.name);
      return this.cachedData;

    } catch (error) {
      console.error('Failed to fetch S3 data:', error);
      return null;
    }
  }

  async getDeviceIdentification(): Promise<DeviceIdentification | null> {
    const data = await this.fetchProductData();
    if (!data) return null;

    const product = data.product;
    let description = `${product.name} by ${product.brand}`;

    if (product.dimensions) {
      description += ` (${product.dimensions.width_cm}×${product.dimensions.depth_cm}×${product.dimensions.height_cm} cm)`;
    }

    if (product.weight_kg) {
      description += `, weighs ${product.weight_kg} kg`;
    }

    if (product.price_usd) {
      description += `, priced at $${product.price_usd}`;
    }

    if (product.color) {
      description += `, color: ${product.color}`;
    }

    return {
      name: product.name,
      category: 'furniture',
      model: product.id,
      brand: product.brand,
      confidence: 1.0, // 100% confidence since we have exact data
      description
    };
  }

  async getInstructionManual(): Promise<InstructionManual | null> {
    const data = await this.fetchProductData();
    if (!data || !data.instruction_manual) return null;

    const manual = data.instruction_manual;
    const product = data.product;

    const steps: InstructionStep[] = manual.steps.map(step => ({
      stepNumber: step.step_number,
      title: `Step ${step.step_number}`,
      description: step.description,
      estimatedTime: Math.round(manual.assembly_time_minutes / manual.steps.length),
      tools: step.parts_used,
      warnings: step.step_number === 6 ? ['Secure to wall to prevent tipping'] : []
    }));

    return {
      id: product.id,
      deviceName: product.name,
      deviceModel: product.id,
      brand: product.brand,
      type: 'assembly',
      steps,
      totalSteps: steps.length,
      estimatedTotalTime: manual.assembly_time_minutes,
      difficulty: 'medium',
      tools: manual.tools_required,
      parts: this.extractAllParts(manual.steps)
    };
  }

  private extractAllParts(steps: Array<{parts_used: string[]}>): string[] {
    const allParts = new Set<string>();
    steps.forEach(step => {
      step.parts_used.forEach(part => allParts.add(part));
    });
    return Array.from(allParts);
  }

  async refreshData(): Promise<boolean> {
    this.cachedData = null;
    this.lastFetch = null;
    const data = await this.fetchProductData();
    return data !== null;
  }

  getCachedData(): S3ProductData | null {
    return this.cachedData;
  }

  getDataSummary(): string {
    if (!this.cachedData) return 'No data loaded';

    const product = this.cachedData.product;
    const manual = this.cachedData.instruction_manual;

    let summary = `**${product.name}** by ${product.brand}\n`;
    summary += `Model: ${product.id}\n`;
    summary += `Color: ${product.color}\n`;
    summary += `Material: ${product.material}\n`;

    if (product.dimensions) {
      summary += `Size: ${product.dimensions.width_cm}×${product.dimensions.depth_cm}×${product.dimensions.height_cm} cm\n`;
    }

    if (product.weight_kg) {
      summary += `Weight: ${product.weight_kg} kg\n`;
    }

    if (product.price_usd) {
      summary += `Price: $${product.price_usd}\n`;
    }

    if (product.shelves) {
      summary += `Shelves: ${product.shelves}\n`;
    }

    if (manual) {
      summary += `\n**Assembly Info:**\n`;
      summary += `Time: ${manual.assembly_time_minutes} minutes\n`;
      summary += `Difficulty: medium\n`;
      summary += `Steps: ${manual.steps.length}\n`;
      summary += `Tools: ${manual.tools_required.join(', ')}\n`;

      if (manual.safety_warnings.length > 0) {
        summary += `\n**Safety Warnings:**\n`;
        manual.safety_warnings.forEach(warning => {
          summary += `${warning}\n`;
        });
      }
    }

    return summary;
  }
}