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
            {/* Inputs (Left) */}
            <div className="relative h-64 md:h-80 flex items-center justify-center">
              {/* Spreadsheet */}
              <div className={`absolute transition-all duration-700 ${activeInputIndex === 0 ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}>
                <div className="bg-card rounded-lg shadow-lg p-6 border-2 border-success/30 w-56 md:w-72">
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <div className="h-3 bg-success/40 rounded flex-1"></div>
                      <div className="h-3 bg-success/40 rounded flex-1"></div>
                      <div className="h-3 bg-success/40 rounded flex-1"></div>
                    </div>
                    {[...Array(6)].map((_, i) => (
                      <div key={i} className="flex gap-2">
                        <div className="h-2 bg-muted rounded flex-1"></div>
                        <div className="h-2 bg-muted rounded flex-1"></div>
                        <div className="h-2 bg-muted rounded flex-1"></div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-success font-semibold mt-3">Spreadsheet</p>
                </div>
              </div>
              
              {/* Text Document */}
              <div className={`absolute transition-all duration-700 ${activeInputIndex === 1 ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}>
                <div className="bg-card rounded-lg shadow-lg p-6 border-2 border-primary/30 w-56 md:w-72">
                  <div className="space-y-2">
                    {[...Array(8)].map((_, i) => (
                      <div key={i} className={`h-2 bg-muted rounded ${i % 3 === 0 ? 'w-3/4' : 'w-full'}`}></div>
                    ))}
                  </div>
                  <p className="text-xs text-primary font-semibold mt-3">Text Document</p>
                </div>
              </div>

              {/* Word Document */}
              <div className={`absolute transition-all duration-700 ${activeInputIndex === 2 ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}>
                <div className="bg-card rounded-lg shadow-lg p-6 border-2 border-info/30 w-56 md:w-72">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-4 h-4 bg-info rounded"></div>
                    <div className="h-2 bg-info/60 rounded w-20"></div>
                  </div>
                  <div className="space-y-2">
                    {[...Array(7)].map((_, i) => (
                      <div key={i} className="h-2 bg-muted rounded"></div>
                    ))}
                  </div>
                  <p className="text-xs text-info font-semibold mt-3">Word Doc</p>
                </div>
              </div>

              {/* PDF */}
              <div className={`absolute transition-all duration-700 ${activeInputIndex === 3 ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}>
                <div className="bg-card rounded-lg shadow-lg p-6 border-2 border-destructive/30 w-56 md:w-72">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-6 h-6 bg-destructive rounded flex items-center justify-center text-[8px] text-white font-bold">PDF</div>
                  </div>
                  <div className="space-y-2">
                    <div className="h-3 bg-muted rounded w-2/3"></div>
                    {[...Array(6)].map((_, i) => (
                      <div key={i} className="h-2 bg-muted rounded"></div>
                    ))}
                  </div>
                  <p className="text-xs text-destructive font-semibold mt-3">PDF Document</p>
                </div>
              </div>
            </div>

            {/* Diagonal Slash */}
            <div className="hidden md:block relative h-80">
              <div className="absolute inset-0 flex items-center justify-center">
                <div 
                  className="w-24 h-full bg-gradient-to-br from-primary via-accent to-primary bg-[length:200%_200%] animate-gradient-shift"
                  style={{
                    clipPath: 'polygon(20% 0%, 100% 0%, 80% 100%, 0% 100%)',
                    boxShadow: '0 10px 40px -10px hsl(var(--primary) / 0.5)'
                  }}
                ></div>
              </div>
            </div>

            {/* Mobile Divider */}
            <div className="md:hidden flex items-center justify-center py-4">
              <div className="w-16 h-16 rounded-full bg-gradient-to-r from-primary to-accent flex items-center justify-center animate-pulse">
                <Wand2 className="w-8 h-8 text-white" />
              </div>
            </div>

            {/* Outputs (Right) */}
            <div className="relative h-64 md:h-80 flex items-center justify-center">
              {/* Certificate */}
              <div className={`absolute transition-all duration-700 ${activeOutputIndex === 0 ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}>
                <div className="bg-gradient-to-br from-warning/10 to-warning/5 rounded-lg shadow-xl p-6 border-4 border-warning/40 w-56 md:w-72">
                  <div className="text-center space-y-3">
                    <div className="h-2 bg-warning/60 rounded w-32 mx-auto"></div>
                    <div className="h-4 bg-warning rounded w-40 mx-auto"></div>
                    <div className="h-2 bg-muted rounded w-36 mx-auto"></div>
                    <div className="w-12 h-12 rounded-full bg-warning/30 mx-auto mt-4 flex items-center justify-center">
                      <div className="w-8 h-8 rounded-full bg-warning"></div>
                    </div>
                  </div>
                  <p className="text-xs text-warning font-semibold mt-3 text-center">Certificate</p>
                </div>
              </div>

              {/* Label */}
              <div className={`absolute transition-all duration-700 ${activeOutputIndex === 1 ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}>
                <div className="bg-card rounded-lg shadow-xl p-6 border-2 border-success/40 w-56 md:w-72">
                  <div className="space-y-2">
                    <div className="h-3 bg-success rounded w-24"></div>
                    <div className="h-6 bg-success/60 rounded w-full"></div>
                    <div className="flex gap-2 mt-3">
                      <div className="h-2 bg-muted rounded flex-1"></div>
                      <div className="h-2 bg-muted rounded flex-1"></div>
                    </div>
                    <div className="h-8 bg-muted/50 rounded w-16 mt-2"></div>
                  </div>
                  <p className="text-xs text-success font-semibold mt-3">Product Label</p>
                </div>
              </div>

              {/* Card */}
              <div className={`absolute transition-all duration-700 ${activeOutputIndex === 2 ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}>
                <div className="bg-gradient-to-br from-accent/10 to-primary/10 rounded-lg shadow-xl p-6 border-2 border-accent/40 w-56 md:w-72">
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-accent/30"></div>
                      <div className="space-y-1 flex-1">
                        <div className="h-3 bg-accent rounded w-20"></div>
                        <div className="h-2 bg-muted rounded w-28"></div>
                      </div>
                    </div>
                    <div className="h-2 bg-muted rounded"></div>
                    <div className="h-2 bg-muted rounded w-3/4"></div>
                  </div>
                  <p className="text-xs text-accent font-semibold mt-3">Greeting Card</p>
                </div>
              </div>

              {/* Name Badge */}
              <div className={`absolute transition-all duration-700 ${activeOutputIndex === 3 ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}>
                <div className="bg-card rounded-lg shadow-xl p-6 border-2 border-primary/40 w-56 md:w-72">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-lg bg-primary/20"></div>
                    <div className="space-y-2 flex-1">
                      <div className="h-4 bg-primary rounded w-24"></div>
                      <div className="h-2 bg-muted rounded w-20"></div>
                      <div className="h-2 bg-muted rounded w-16"></div>
                    </div>
                  </div>
                  <p className="text-xs text-primary font-semibold mt-3">Name Badge</p>
                </div>
              </div>
            </div>
          </div>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center mt-12">
            <Button size="lg" className="text-lg px-8" onClick={() => navigate('/auth')}>
              Get Started Free
            </Button>
            <Button size="lg" variant="outline" className="text-lg px-8">
              Watch Demo
            </Button>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="container mx-auto px-4 py-20">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-4">Simple, Transparent Pricing</h2>
          <p className="text-xl text-muted-foreground">Choose the plan that fits your needs</p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto">
          {pricingTiers.map((tier, index) => (
            <Card key={index} className={`relative hover:shadow-xl transition-all duration-300 ${tier.popular ? 'border-primary shadow-lg scale-105' : ''}`}>
              {tier.popular && (
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-success">
                  Most Popular
                </Badge>
              )}
              <CardHeader>
                <CardTitle className="text-2xl">{tier.name}</CardTitle>
                <CardDescription>
                  <span className="text-4xl font-bold text-foreground">{tier.price}</span>
                  <span className="text-muted-foreground">{tier.period}</span>
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {tier.features.map((feature, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <Check className="w-5 h-5 text-success" />
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                <Button className="w-full" variant={tier.popular ? "default" : "outline"}>
                  {tier.cta}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      </section>

      {/* How It Works */}
      <section className="container mx-auto px-4 py-20 bg-muted/30">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-4">How It Works</h2>
          <p className="text-xl text-muted-foreground">Three simple steps to beautiful documents</p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Upload className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-xl font-semibold mb-2">1. Upload Your Data</h3>
            <p className="text-muted-foreground">Import from CSV, Excel, Google Sheets, or paste directly</p>
          </div>

          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-4">
              <Wand2 className="w-8 h-8 text-accent" />
            </div>
            <h3 className="text-xl font-semibold mb-2">2. Design Your Template</h3>
            <p className="text-muted-foreground">Choose a template or upload your own design</p>
          </div>

          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-4">
              <Download className="w-8 h-8 text-success" />
            </div>
            <h3 className="text-xl font-semibold mb-2">3. Generate & Download</h3>
            <p className="text-muted-foreground">Get your personalized PDFs in seconds</p>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="container mx-auto px-4 py-20">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-4">Powerful Features</h2>
          <p className="text-xl text-muted-foreground">Everything you need to create professional documents</p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-7xl mx-auto">
          {features.map((feature, index) => (
            <Card key={index} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <feature.icon className="w-6 h-6 text-primary" />
                </div>
                <CardTitle className="text-xl">{feature.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">{feature.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Use Cases */}
      <section id="use-cases" className="container mx-auto px-4 py-20 bg-muted/30">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-4">Perfect For</h2>
          <p className="text-xl text-muted-foreground">See what you can create</p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {useCases.map((useCase, index) => (
            <Card key={index} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <CardTitle>{useCase.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">{useCase.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-4 py-20">
        <div className="max-w-4xl mx-auto text-center bg-gradient-to-r from-primary to-accent rounded-2xl p-12 text-white">
          <h2 className="text-4xl md:text-5xl font-bold mb-4">Ready to Get Started?</h2>
          <p className="text-xl mb-8 opacity-90">
            Join thousands of users creating beautiful documents
          </p>
          <Button size="lg" variant="secondary" className="text-lg px-8">
            Start Free Trial
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t bg-muted/30">
        <div className="container mx-auto px-4 py-12">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <h3 className="text-lg font-bold mb-4 bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                Mail Merge
              </h3>
              <p className="text-sm text-muted-foreground">
                Transform your data into professional documents with AI-powered mail merge.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Product</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#features" className="hover:text-foreground transition-colors">Features</a></li>
                <li><a href="#pricing" className="hover:text-foreground transition-colors">Pricing</a></li>
                <li><a href="#use-cases" className="hover:text-foreground transition-colors">Use Cases</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Company</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-foreground transition-colors">About</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Blog</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Contact</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Legal</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-foreground transition-colors">Privacy</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Terms</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Security</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t mt-8 pt-8 text-center text-sm text-muted-foreground">
            <p>&copy; 2024 Mail Merge. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
