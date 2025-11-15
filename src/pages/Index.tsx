import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, Zap, Shield, Download, Upload, Wand2 } from "lucide-react";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

const Index = () => {
  const navigate = useNavigate();
  const [rotatingWordIndex, setRotatingWordIndex] = useState(0);
  const [activeInputIndex, setActiveInputIndex] = useState(0);
  const [activeOutputIndex, setActiveOutputIndex] = useState(0);

  const rotatingWords = ['Certificates', 'Labels', 'Cards', 'Name Badges', 'Stickers', 'Invitations', 'Tickets', 'Vouchers'];

  useEffect(() => {
    const wordInterval = setInterval(() => {
      setRotatingWordIndex((prev) => (prev + 1) % rotatingWords.length);
    }, 1500);

    const inputInterval = setInterval(() => {
      setActiveInputIndex((prev) => (prev + 1) % 4);
    }, 2000);

    const outputInterval = setInterval(() => {
      setActiveOutputIndex((prev) => (prev + 1) % 4);
    }, 2000);

    return () => {
      clearInterval(wordInterval);
      clearInterval(inputInterval);
      clearInterval(outputInterval);
    };
  }, []);

  const pricingTiers = [
    {
      name: "Free",
      price: "$0",
      period: "/month",
      pages: "10",
      features: [
        "10 pages per month",
        "Basic templates",
        "CSV/Excel upload",
        "Email support",
      ],
      cta: "Get Started",
      popular: false,
    },
    {
      name: "Simple",
      price: "$19",
      period: "/month",
      pages: "50",
      features: [
        "50 pages per month",
        "All templates",
        "Google Sheets integration",
        "AI data cleaning",
        "Priority support",
      ],
      cta: "Start Free Trial",
      popular: true,
    },
    {
      name: "Power",
      price: "$49",
      period: "/month",
      pages: "500",
      features: [
        "500 pages per month",
        "Everything in Simple",
        "Custom templates",
        "Advanced AI suggestions",
        "API access",
        "Team collaboration",
      ],
      cta: "Start Free Trial",
      popular: false,
    },
    {
      name: "Pro",
      price: "$149",
      period: "/month",
      pages: "5,000",
      features: [
        "5,000 pages per month",
        "Everything in Power",
        "White-label exports",
        "Dedicated support",
        "Custom integrations",
        "SLA guarantee",
      ],
      cta: "Contact Sales",
      popular: false,
    },
  ];

  const features = [
    {
      icon: Wand2,
      title: "AI-Powered Data Cleaning",
      description: "Automatically fix formatting issues, correct spelling errors, and normalize your data for perfect output.",
    },
    {
      icon: Zap,
      title: "Lightning Fast",
      description: "Generate hundreds of personalized documents in seconds with our optimized processing engine.",
    },
    {
      icon: Shield,
      title: "Enterprise Security",
      description: "Your data is encrypted at rest and in transit. SOC 2 compliant with GDPR support.",
    },
    {
      icon: Download,
      title: "Flexible Export",
      description: "Download individual PDFs or bulk exports. Print-ready with proper bleed settings.",
    },
  ];

  const useCases = [
    {
      title: "Event Certificates",
      description: "Generate personalized certificates for course completions, awards, or event attendance.",
    },
    {
      title: "Product Labels",
      description: "Create variable data labels for inventory, shipping, or product packaging in bulk.",
    },
    {
      title: "Name Badges",
      description: "Design and print professional name badges for conferences, workshops, or company events.",
    },
    {
      title: "Greeting Cards",
      description: "Personalize greeting cards with recipient names, custom messages, and unique designs.",
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/20">
      {/* Navigation */}
      <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-8">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Mail Merge
            </h1>
            <div className="hidden md:flex space-x-6">
              <a href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Features</a>
              <a href="#pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Pricing</a>
              <a href="#use-cases" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Use Cases</a>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <Button variant="ghost" onClick={() => navigate('/auth')}>Log In</Button>
            <Button onClick={() => navigate('/auth')}>Sign Up</Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-16 md:py-24">
        <div className="max-w-7xl mx-auto">
          {/* Dynamic Headline */}
          <div className="text-center mb-12 md:mb-16">
            <h2 className="text-5xl md:text-7xl lg:text-8xl font-extrabold mb-4 leading-tight">
              <span className="text-foreground">CREATE </span>
              <span 
                key={rotatingWordIndex}
                className="inline-block bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent animate-fade-in"
              >
                {rotatingWords[rotatingWordIndex]}
              </span>
            </h2>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mt-6">
              No design skills required. Just upload your data.
            </p>
          </div>

          {/* Visual Split with Diagonal Slash */}
          <div className="relative grid md:grid-cols-[1fr,120px,1fr] gap-4 md:gap-0 items-center mb-12">

      {/* Footer */}
      <footer className="border-t border-border bg-card py-12">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-8">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                  <FileText className="w-5 h-5 text-white" />
                </div>
                <span className="text-xl font-bold text-foreground">MergeFlow</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Professional variable data printing and mail merge solutions.
              </p>
            </div>

            <div>
              <h3 className="font-semibold text-foreground mb-4">Product</h3>
              <ul className="space-y-2">
                <li><a href="#features" className="text-sm text-muted-foreground hover:text-foreground">Features</a></li>
                <li><a href="#pricing" className="text-sm text-muted-foreground hover:text-foreground">Pricing</a></li>
                <li><a href="#use-cases" className="text-sm text-muted-foreground hover:text-foreground">Use Cases</a></li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold text-foreground mb-4">Company</h3>
              <ul className="space-y-2">
                <li><a href="#" className="text-sm text-muted-foreground hover:text-foreground">About</a></li>
                <li><a href="#" className="text-sm text-muted-foreground hover:text-foreground">Blog</a></li>
                <li><a href="#" className="text-sm text-muted-foreground hover:text-foreground">Contact</a></li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold text-foreground mb-4">Legal</h3>
              <ul className="space-y-2">
                <li><a href="#" className="text-sm text-muted-foreground hover:text-foreground">Privacy</a></li>
                <li><a href="#" className="text-sm text-muted-foreground hover:text-foreground">Terms</a></li>
                <li><a href="#" className="text-sm text-muted-foreground hover:text-foreground">Security</a></li>
              </ul>
            </div>
          </div>

          <div className="mt-12 pt-8 border-t border-border text-center text-sm text-muted-foreground">
            <p>&copy; 2025 MergeFlow. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
