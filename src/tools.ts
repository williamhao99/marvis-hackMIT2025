import { ToolCall, AppSession } from '@mentra/sdk';
import { HandymanService } from './services/handymanService';

const handymanService = new HandymanService();

export async function handleToolCall(toolCall: ToolCall, userId: string, session: AppSession|undefined): Promise<string | undefined> {
  console.log(`Tool called: ${toolCall.toolId}`);
  console.log(`Tool call timestamp: ${toolCall.timestamp}`);
  console.log(`Tool call userId: ${toolCall.userId}`);
  if (toolCall.toolParameters && Object.keys(toolCall.toolParameters).length > 0) {
    console.log("Tool call parameter values:", toolCall.toolParameters);
  }

  if (!session) {
    console.warn('No active session for tool call');
    return "Please start a session first.";
  }

  try {
    switch (toolCall.toolId) {
      case "identify_device":
        return await handymanService.identifyDevice(userId, session);

      case "refresh_data":
        return await handleRefreshData(userId, session);

      case "get_instructions":
        const itemName = toolCall.toolParameters?.item_name as string;
        return await handymanService.getInstructions(userId, session, itemName);

      case "next_step":
        return await handymanService.nextStep(userId, session);

      case "previous_step":
        return await handymanService.previousStep(userId, session);

      case "report_progress":
        const status = toolCall.toolParameters?.status as string;
        return await handymanService.reportProgress(userId, session, status);

      case "request_help":
        const issue = toolCall.toolParameters?.issue as string;
        return await handymanService.requestHelp(userId, session, issue);

      case "repeat_instruction":
        return await handymanService.repeatInstruction(userId, session);

      default:
        console.warn(`Unknown tool: ${toolCall.toolId}`);
        return `Unknown tool: ${toolCall.toolId}`;
    }
  } catch (error) {
    console.error('Tool execution error:', error);
    return "Sorry, I encountered an error processing your request. Please try again.";
  }
}

async function handleRefreshData(userId: string, session: AppSession): Promise<string> {
  try {
    session.layouts.showTextWall("Refreshing product data...");

    const { DataIngestionService } = await import('./services/dataIngestionService');
    const dataService = new DataIngestionService();
    const refreshed = await dataService.refreshData();

    if (refreshed) {
      return "Product data refreshed successfully! Say 'identify this' to see the latest information.";
    } else {
      return "Failed to refresh product data. Please check your connection and try again.";
    }
  } catch (error) {
    console.error('Data refresh error:', error);
    return "Error refreshing data. Please try again later.";
  }
}