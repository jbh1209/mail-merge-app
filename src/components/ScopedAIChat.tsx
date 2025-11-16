import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Loader2, Sparkles, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { AIPersona, AI_PERSONAS } from '@/lib/ai-personas';
import { toast } from 'sonner';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ScopedAIChatProps {
  persona: AIPersona;
  context: Record<string, any>;
  className?: string;
  maxHeight?: string;
  onMessageSent?: (message: string) => void;
  onResponseReceived?: (response: string) => void;
}

export function ScopedAIChat({
  persona,
  context,
  className,
  maxHeight = 'h-[500px]',
  onMessageSent,
  onResponseReceived
}: ScopedAIChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const personaConfig = AI_PERSONAS[persona];

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = async (messageText: string) => {
    if (!messageText.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      role: 'user',
      content: messageText,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    onMessageSent?.(messageText);

    try {
      const { data, error } = await supabase.functions.invoke('scoped-ai-assistant', {
        body: {
          persona,
          message: messageText,
          chatHistory: messages,
          context
        }
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: data.message,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMessage]);
      onResponseReceived?.(data.message);
    } catch (error: any) {
      console.error('AI chat error:', error);
      toast.error(error.message || 'Failed to get AI response');
      
      // Remove the user message on error
      setMessages(prev => prev.slice(0, -1));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSuggestedQuestion = (question: string) => {
    sendMessage(question);
  };

  return (
    <div className={cn('flex flex-col space-y-4', className)}>
      {/* Persona Info */}
      <Alert>
        <Sparkles className="h-4 w-4" />
        <AlertTitle className="flex items-center gap-2">
          {personaConfig.name}
          <Badge variant="outline" className="text-xs">
            Specialized
          </Badge>
        </AlertTitle>
        <AlertDescription className="mt-2">
          <p className="text-sm mb-2">{personaConfig.description}</p>
          <div className="flex flex-wrap gap-1">
            {personaConfig.scope.slice(0, 3).map((item, idx) => (
              <Badge key={idx} variant="secondary" className="text-xs">
                {item}
              </Badge>
            ))}
          </div>
        </AlertDescription>
      </Alert>

      {/* Messages */}
      <ScrollArea className={cn('border rounded-lg p-4', maxHeight)}>
        <div className="space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-8">
              <Bot className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground mb-4">
                Ask me questions about {personaConfig.description.toLowerCase()}
              </p>

              {/* Suggested Questions */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground flex items-center justify-center gap-2">
                  <HelpCircle className="h-3 w-3" />
                  Suggested Questions:
                </p>
                {personaConfig.suggestedQuestions.map((q, idx) => (
                  <Button
                    key={idx}
                    variant="ghost"
                    size="sm"
                    className="text-xs w-full justify-start text-left h-auto py-2 px-3"
                    onClick={() => handleSuggestedQuestion(q)}
                    disabled={isLoading}
                  >
                    {q}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={cn(
                'flex gap-3 p-3 rounded-lg',
                msg.role === 'user'
                  ? 'bg-primary/10 ml-8'
                  : 'bg-muted mr-8'
              )}
            >
              <div className="shrink-0 w-8 h-8 rounded-full bg-background border flex items-center justify-center">
                {msg.role === 'user' ? (
                  <User className="h-4 w-4" />
                ) : (
                  <Bot className="h-4 w-4" />
                )}
              </div>
              <div className="flex-1 space-y-1">
                <p className="text-sm font-semibold">
                  {msg.role === 'user' ? 'You' : personaConfig.name}
                </p>
                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                <p className="text-xs text-muted-foreground">
                  {msg.timestamp.toLocaleTimeString([], { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                  })}
                </p>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground p-3">
              <Loader2 className="h-4 w-4 animate-spin" />
              {personaConfig.name} is thinking...
            </div>
          )}

          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="flex gap-2">
        <Input
          placeholder={`Ask ${personaConfig.name}...`}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              sendMessage(input);
            }
          }}
          disabled={isLoading}
          className="flex-1"
        />
        <Button
          onClick={() => sendMessage(input)}
          disabled={!input.trim() || isLoading}
          size="icon"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
