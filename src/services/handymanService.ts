import { AppSession } from '@mentra/sdk';
import { VisionService } from './visionService';
import { InstructionService } from './instructionService';
import { SessionManager } from './sessionManager';
import { DataIngestionService } from './dataIngestionService';
import { DeviceIdentification, InstructionManual, UserSession } from './types';

export class HandymanService {
  private visionService: VisionService;
  private instructionService: InstructionService;
  private sessionManager: SessionManager;
  private dataIngestionService: DataIngestionService;

  constructor() {
    this.visionService = new VisionService();
    this.instructionService = new InstructionService();
    this.sessionManager = new SessionManager();
    this.dataIngestionService = new DataIngestionService();
  }

  async identifyDevice(userId: string, session: AppSession, imageBuffer?: Buffer): Promise<string> {
    try {
      session.layouts.showTextWall("Loading product data...");

      const deviceIdentification = await this.dataIngestionService.getDeviceIdentification();

      if (!deviceIdentification) {
        return "Sorry, I couldn't load the product data from the server. Please try again.";
      }

      const userSession = this.sessionManager.getSession(userId) || this.sessionManager.createSession(userId);
      this.sessionManager.addNote(userId, `Loaded device: ${deviceIdentification.name}`);

      const productSummary = this.dataIngestionService.getDataSummary();

      let response = `**Product Loaded**\n\n`;
      response += productSummary;
      response += "\n\nSay 'show instructions' to get step-by-step assembly guidance!";

      session.layouts.showTextWall(response);
      return response;

    } catch (error) {
      console.error('Device identification error:', error);
      return "Sorry, I encountered an error while loading the product data. Please try again.";
    }
  }

  async getInstructions(userId: string, session: AppSession, itemName?: string): Promise<string> {
    try {
      session.layouts.showTextWall("Loading assembly instructions...");

      const s3Manual = await this.dataIngestionService.getInstructionManual();

      if (s3Manual) {
        this.sessionManager.setCurrentManual(userId, s3Manual);
        const response = this.formatInstructionOverview(s3Manual);
        session.layouts.showTextWall(response);

        setTimeout(() => {
          this.showCurrentStep(userId, session);
        }, 3000);

        return response;
      }

      let device: DeviceIdentification;

      if (itemName) {
        device = {
          name: itemName,
          category: 'general',
          confidence: 0.8,
          description: `User specified: ${itemName}`
        };
      } else {
        const s3Device = await this.dataIngestionService.getDeviceIdentification();
        if (s3Device) {
          device = s3Device;
        } else {
          return "Please first load product data by saying 'identify this' or tell me what you need help with.";
        }
      }

      const searchResults = await this.instructionService.findInstructions(device);

      if (searchResults.length === 0) {
        return `Sorry, I couldn't find instructions for ${device.name}. Try searching online for "${device.name} ${device.brand || ''} manual".`;
      }

      const bestResult = searchResults[0];
      this.sessionManager.setCurrentManual(userId, bestResult.manual);

      const response = this.formatInstructionOverview(bestResult.manual);
      session.layouts.showTextWall(response);

      setTimeout(() => {
        this.showCurrentStep(userId, session);
      }, 3000);

      return response;

    } catch (error) {
      console.error('Get instructions error:', error);
      return "Sorry, I encountered an error while loading instructions. Please try again.";
    }
  }

  async showCurrentStep(userId: string, session: AppSession): Promise<string> {
    const currentStep = this.sessionManager.getCurrentStep(userId);
    const userSession = this.sessionManager.getSession(userId);

    if (!currentStep || !userSession?.currentManual) {
      return "No active instruction session. Say 'show instructions' to start.";
    }

    const stepDisplay = this.instructionService.formatStepForDisplay(currentStep, userSession.currentManual);
    const progress = this.sessionManager.getProgress(userId);

    let response = `**${userSession.currentManual.deviceName}**\n`;
    if (progress) {
      response += `Progress: ${progress.completed.length}/${progress.total} steps (${progress.percentage}%)\n\n`;
    }
    response += stepDisplay;

    response += "\n\nSay 'next step' to continue or 'I'm done' when finished.";

    const voiceEnabled = session.settings.get<boolean>('voice_guidance_enabled', true);
    if (voiceEnabled) {
      setTimeout(() => {
        session.layouts.showTextWall("" + currentStep.description);
      }, 2000);
    }

    session.layouts.showTextWall(response);
    return response;
  }

  async nextStep(userId: string, session: AppSession): Promise<string> {
    const userSession = this.sessionManager.nextStep(userId);

    if (!userSession?.currentManual) {
      return "No active instruction session. Say 'show instructions' to start.";
    }

    if (userSession.currentStep > userSession.currentManual.totalSteps) {
      this.sessionManager.endSession(userId);
      return "Congratulations! You've completed all steps. Great job!";
    }

    return this.showCurrentStep(userId, session);
  }

  async previousStep(userId: string, session: AppSession): Promise<string> {
    const userSession = this.sessionManager.previousStep(userId);

    if (!userSession?.currentManual) {
      return "No active instruction session. Say 'show instructions' to start.";
    }

    return this.showCurrentStep(userId, session);
  }

  async reportProgress(userId: string, session: AppSession, status?: string): Promise<string> {
    const userSession = this.sessionManager.getSession(userId);

    if (!userSession?.currentManual) {
      return "No active instruction session. Say 'show instructions' to start.";
    }

    this.sessionManager.completeStep(userId);

    if (status) {
      this.sessionManager.addNote(userId, `Progress: ${status}`);
    }

    const progress = this.sessionManager.getProgress(userId);
    let response = "Step marked as complete!\n\n";

    if (progress) {
      response += `Progress: ${progress.completed.length}/${progress.total} steps completed (${progress.percentage}%)\n\n`;
    }

    if (userSession.currentStep >= userSession.currentManual.totalSteps) {
      this.sessionManager.endSession(userId);
      response += "All steps completed! Excellent work!";
    } else {
      response += "Ready for the next step? Say 'next step' to continue.";
    }

    session.layouts.showTextWall(response);
    return response;
  }

  async requestHelp(userId: string, session: AppSession, issue?: string): Promise<string> {
    const userSession = this.sessionManager.getSession(userId);

    let response = "**Remote Assistance Requested**\n\n";

    if (issue) {
      response += `Issue: ${issue}\n\n`;
    }

    if (userSession?.currentManual) {
      response += `Current task: ${userSession.currentManual.deviceName}\n`;
      response += `Step: ${userSession.currentStep} of ${userSession.currentManual.totalSteps}\n\n`;
    }

    response += "A support request has been logged. In a real implementation, this would:\n";
    response += "Start video streaming via MentraOS Live\n";
    response += "Connect you with a remote expert\n";
    response += "Allow screen sharing of instructions\n\n";
    response += "For now, try rephrasing your question or saying 'repeat instruction'.";

    if (issue) {
      this.sessionManager.addNote(userId, `Help requested: ${issue}`);
    }

    session.layouts.showTextWall(response);
    return response;
  }

  async repeatInstruction(userId: string, session: AppSession): Promise<string> {
    return this.showCurrentStep(userId, session);
  }

  private formatInstructionOverview(manual: InstructionManual): string {
    let overview = `**${manual.deviceName} ${manual.type.toUpperCase()}**\n\n`;

    if (manual.brand) overview += `Brand: ${manual.brand}\n`;
    overview += `Difficulty: ${manual.difficulty}\n`;
    overview += `Total steps: ${manual.totalSteps}\n`;

    if (manual.estimatedTotalTime) {
      overview += `Estimated time: ${manual.estimatedTotalTime} minutes\n`;
    }

    if (manual.tools.length > 0) {
      overview += `\n**Tools needed:**\n${manual.tools.map(tool => tool).join('\n')}\n`;
    }

    if (manual.parts.length > 0) {
      overview += `\n**Parts:**\n${manual.parts.map(part => part).join('\n')}\n`;
    }

    overview += "\nStarting with step 1...";

    return overview;
  }

  getSessionManager(): SessionManager {
    return this.sessionManager;
  }

  getActiveSession(userId: string): UserSession | null {
    return this.sessionManager.getSession(userId);
  }
}