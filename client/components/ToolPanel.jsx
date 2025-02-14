import { useEffect, useState, useRef } from "react";

const functionDescription = `
Call these functions to assist with patent documentation.
`;

const sessionUpdate = {
  type: "session.update",
  session: {
    instructions: `
You are ScreenSense AI, a communication interface between inventors and patent lawyers. You facilitate patent documentation by:


Keep on asking questions to the user to help you document the invention. Keep on doing this until you think thta the information provided by the user is enough to document the invention and file a patent from it.
   `
  }
};

async function executeFunctionCall(functionCall) {
  try {
    console.log('Executing function call:', functionCall);
    const response = await fetch('/function', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: functionCall.name,
        arguments: JSON.parse(functionCall.arguments),
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    console.log('Function call result:', result);
    return result;
  } catch (error) {
    console.error('Error executing function:', error);
    return { error: error.message };
  }
}

function FunctionCallOutput({ functionCallOutput, sendClientEvent }) {
  const [result, setResult] = useState(null);
  const executionRef = useRef(false);

  useEffect(() => {
    const executeFunction = async () => {
      // Prevent duplicate executions
      if (executionRef.current) {
        console.log('Preventing duplicate function execution');
        return;
      }

      executionRef.current = true;
      const functionResult = await executeFunctionCall(functionCallOutput);
      setResult(functionResult);

      // Send the function result back to the assistant
      sendClientEvent({
        type: "function.response",
        response: {
          function_call: functionCallOutput,
          output: functionResult
        }
      });
    };

    executeFunction();

    // Cleanup function to reset the execution flag
    return () => {
      executionRef.current = false;
    };
  }, [functionCallOutput, sendClientEvent]);

  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-bold">{functionCallOutput.name}</h3>
      <div className="text-sm">
        <h4 className="font-semibold">Arguments:</h4>
        <pre className="text-xs bg-gray-100 rounded-md p-2 overflow-x-auto">
          {functionCallOutput.arguments}
        </pre>
      </div>
      {result && (
        <div className="text-sm">
          <h4 className="font-semibold">Result:</h4>
          <pre className="text-xs bg-gray-100 rounded-md p-2 overflow-x-auto">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

export default function ToolPanel({
  isSessionActive,
  sendClientEvent,
  events,
}) {
  const [functionAdded, setFunctionAdded] = useState(false);
  const [functionCallOutput, setFunctionCallOutput] = useState(null);
  const lastFunctionCallRef = useRef(null);

  // Initialize session when it becomes active
  useEffect(() => {
    if (isSessionActive && !functionAdded) {
      console.log('Session is active, sending initial configuration');
      sendClientEvent(sessionUpdate);
      setFunctionAdded(true);
    }
  }, [isSessionActive, functionAdded, sendClientEvent]);

  // Handle incoming events
  useEffect(() => {
    if (!events || events.length === 0) return;

    const mostRecentEvent = events[0];
    console.log('Processing event:', mostRecentEvent);

    if (mostRecentEvent.type === "response.done" && mostRecentEvent.response?.output) {
      mostRecentEvent.response.output.forEach((output) => {
        if (output.type === "function_call") {
          // Check if this is a duplicate call
          const currentCall = JSON.stringify(output);
          if (currentCall === lastFunctionCallRef.current) {
            console.log('Preventing duplicate function call');
            return;
          }

          console.log('Received function call:', output);
          lastFunctionCallRef.current = currentCall;
          setFunctionCallOutput(output);
        }
      });
    }
  }, [events]);

  // Reset state when session becomes inactive
  useEffect(() => {
    if (!isSessionActive) {
      console.log('Session became inactive, resetting state');
      setFunctionAdded(false);
      setFunctionCallOutput(null);
      lastFunctionCallRef.current = null;
    }
  }, [isSessionActive]);

  return (
    <section className="h-full w-full flex flex-col gap-4">
      <div className="h-full bg-gray-50 rounded-md p-4">
        <h2 className="text-lg font-bold">Patent Generator</h2>
        {isSessionActive ? (
          <>
            <div className="mb-4">
              <p className="text-sm text-gray-600">
                {functionAdded ? 'Session configured successfully' : 'Configuring session...'}
              </p>
            </div>
            {functionCallOutput ? (
              <FunctionCallOutput
                functionCallOutput={functionCallOutput}
                sendClientEvent={sendClientEvent}
              />
            ) : (
              <p>Start by providing the title of your invention...</p>
            )}
          </>
        ) : (
          <p>Start the session to begin patent documentation...</p>
        )}
      </div>
    </section>
  );
}
