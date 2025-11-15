import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, Zap, Shield, Download, Upload, Wand2, ArrowRight } from "lucide-react";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

const Index = () => {
  const navigate = useNavigate();
  const [rotatingWordIndex, setRotatingWordIndex] = useState(0);
  const [activeInputIndex, setActiveInputIndex] = useState(0);
  const [activeOutputIndex, setActiveOutputIndex] = useState(0);
  const [taglineIndex, setTaglineIndex] = useState(0);
  const [docTypeIndex, setDocTypeIndex] = useState(0);

  const rotatingWords = ['Certificates', 'Labels', 'Cards', 'Name Badges', 'Stickers', 'Invitations', 'Tickets', 'Vouchers'];
  
  const inputMockups = ['Spreadsheet', 'Text Document', 'Word Document', 'PDF'];
  const outputMockups = ['Certificate', 'Product Label', 'Greeting Card', 'Name Badge'];
  
  const docTypes = ['mail merged', 'variable data', 'personalized', 'custom'];
  
  const taglines = [
    "Never mail-merge in Word again.",
    "Turn any spreadsheet into perfect documents — instantly.",
    "Variable data, without the headaches.",
    "From messy Excel to finished PDFs in minutes.",
    "Finally… mail merge that actually works.",
    "One upload. One template. Thousands of documents.",
    "Your data → beautiful documents. Zero stress.",
    "Labels, certificates, badges… all done automatically.",
    "No more formatting. No more mistakes.",
    "The easiest way to create anything from a spreadsheet.",
    "Give us your data — we'll do the rest.",
    "The future of mail merge starts here."
  ];

  useEffect(() => {
    const wordInterval = setInterval(() => {
      setRotatingWordIndex((prev) => (prev + 1) % rotatingWords.length);
    }, 1500);

    const inputInterval = setInterval(() => {
      setActiveInputIndex((prev) => (prev + 1) % inputMockups.length);
    }, 2000);

    const outputInterval = setInterval(() => {
      setActiveOutputIndex((prev) => (prev + 1) % outputMockups.length);
    }, 2000);

    const taglineInterval = setInterval(() => {
      setTaglineIndex((prev) => (prev + 1) % taglines.length);
    }, 1500);

    const docTypeInterval = setInterval(() => {
      setDocTypeIndex((prev) => (prev + 1) % docTypes.length);
    }, 1500);

    return () => {
      clearInterval(wordInterval);
      clearInterval(inputInterval);
      clearInterval(outputInterval);
      clearInterval(taglineInterval);
      clearInterval(docTypeInterval);
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
      <nav className="border-b bg-card/80 backdrop-blur-xl supports-[backdrop-filter]:bg-card/60 sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-8">
            <h1 className="font-display text-2xl font-bold text-foreground">
              Mail Merge
            </h1>
            <div className="hidden md:flex space-x-6">
              <a href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-300">Features</a>
              <a href="#pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-300">Pricing</a>
              <a href="#use-cases" className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-300">Use Cases</a>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <Button variant="ghost" onClick={() => navigate('/auth')}>Log In</Button>
            <Button variant="premium" onClick={() => navigate('/auth')}>Sign Up</Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-20 md:py-32 relative overflow-hidden">
        {/* Gradient mesh background */}
        <div className="absolute inset-0 opacity-20" style={{ background: 'var(--gradient-mesh)' }}></div>
        <div className="grain-texture"></div>
        
        <div className="max-w-7xl mx-auto relative z-10">
          {/* Asymmetric Layout */}
          <div className="grid lg:grid-cols-[1.2fr,1fr] gap-12 lg:gap-20 items-center">
            {/* Left: Headline & CTA */}
            <div className="space-y-8">
              <div className="space-y-6">
                <h1 className="font-display text-5xl md:text-6xl lg:text-7xl xl:text-8xl font-bold leading-[1.1] tracking-tight">
                  Transform Your Data Into
                  <span className="block text-accent mt-2">Perfect Documents</span>
                </h1>
                <p className="text-lg md:text-xl text-muted-foreground max-w-xl leading-relaxed">
                  Professional certificates, labels, and more—created instantly from your spreadsheets. 
                  No design skills required.
                </p>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-4">
                <Button 
                  size="lg" 
                  variant="premium" 
                  onClick={() => navigate('/auth')}
                  className="text-base group"
                >
                  Start Creating Free
                  <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Button>
                <Button 
                  size="lg" 
                  variant="outline"
                  className="text-base"
                >
                  Watch Demo
                </Button>
              </div>

              {/* Social proof */}
              <div className="flex items-center gap-6 text-sm text-muted-foreground pt-4">
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-success" />
                  <span>No credit card</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-success" />
                  <span>Setup in 60 seconds</span>
                </div>
              </div>
            </div>

            {/* Right: Visual Demo with Floating Cards */}
            <div className="relative h-[400px] lg:h-[500px]">
              {/* Input Card - Floating */}
              <div className="absolute top-0 left-0 w-64 animate-float">
                <Card className="shadow-xl backdrop-blur-sm bg-card/95 border-border/50">
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
                      <Upload className="w-3 h-3" />
                      Input Data
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex gap-2">
                      <div className="h-3 bg-success/30 rounded flex-1"></div>
                      <div className="h-3 bg-success/30 rounded flex-1"></div>
                      <div className="h-3 bg-success/30 rounded flex-1"></div>
                    </div>
                    {[...Array(6)].map((_, i) => (
                      <div key={i} className="flex gap-2">
                        <div className="h-2 bg-muted rounded flex-1"></div>
                        <div className="h-2 bg-muted rounded flex-1"></div>
                        <div className="h-2 bg-muted rounded flex-1"></div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>

              {/* Arrow */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
                <div className="relative">
                  <div className="absolute inset-0 bg-accent/20 blur-xl rounded-full"></div>
                  <div className="relative w-14 h-14 rounded-full bg-gradient-to-br from-accent to-accent/80 flex items-center justify-center shadow-xl">
                    <ArrowRight className="w-7 h-7 text-white" strokeWidth={2.5} />
                  </div>
                </div>
              </div>

              {/* Output Card - Floating with delay */}
              <div className="absolute bottom-0 right-0 w-72" style={{ animationDelay: '1s' }}>
                <Card className="shadow-2xl backdrop-blur-sm bg-card/95 border-accent/30 border-2">
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
                      <Download className="w-3 h-3" />
                      Generated Output
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="aspect-[4/3] rounded bg-gradient-to-br from-accent/10 to-success/10 border border-border/50 flex items-center justify-center">
                      <div className="text-center space-y-2 p-6">
                        <div className="w-12 h-12 mx-auto rounded-full bg-accent/20 flex items-center justify-center">
                          <Wand2 className="w-6 h-6 text-accent" />
                        </div>
                        <div className="space-y-1">
                          <div className="h-2 bg-foreground/80 rounded w-24 mx-auto"></div>
                          <div className="h-1.5 bg-foreground/40 rounded w-32 mx-auto"></div>
                          <div className="h-1.5 bg-foreground/40 rounded w-28 mx-auto"></div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="container mx-auto px-4 py-24 relative">
        <div className="grain-texture"></div>
        <div className="text-center mb-16 relative z-10">
          <Badge variant="outline" className="mb-4 text-xs uppercase tracking-wider">Pricing</Badge>
          <h2 className="font-display text-4xl md:text-5xl font-bold mb-4">Simple, Transparent Pricing</h2>
          <p className="text-xl text-muted-foreground">Choose the plan that works for you</p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto relative z-10">
          {pricingTiers.map((tier, index) => (
            <Card 
              key={index} 
              className={`relative ${tier.popular ? 'border-accent shadow-xl scale-105' : ''}`}
            >
              {tier.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                  <Badge className="bg-accent text-accent-foreground shadow-lg">Most Popular</Badge>
                </div>
              )}
              <CardHeader className="pb-4">
                <CardTitle className="text-2xl font-display">{tier.name}</CardTitle>
                <CardDescription className="text-xs uppercase tracking-wider">{tier.pages} pages/month</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-1">
                  <div className="flex items-baseline">
                    <span className="text-5xl font-bold font-display">{tier.price}</span>
                    <span className="text-muted-foreground ml-2">{tier.period}</span>
                  </div>
                </div>
                <ul className="space-y-3">
                  {tier.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm">
                      <Check className="w-4 h-4 text-success mt-0.5 flex-shrink-0" />
                      <span className="text-muted-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                <Button 
                  className="w-full" 
                  variant={tier.popular ? "premium" : "outline"}
                >
                  {tier.cta}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      </section>

      {/* How It Works */}
      <section className="py-24 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-muted/30 to-background"></div>
        <div className="container mx-auto px-4 relative z-10">
          <div className="text-center mb-16">
            <Badge variant="outline" className="mb-4 text-xs uppercase tracking-wider">Process</Badge>
            <h2 className="font-display text-4xl md:text-5xl font-bold mb-4">How It Works</h2>
            <p className="text-xl text-muted-foreground">Three simple steps to beautiful documents</p>
          </div>

          <div className="grid md:grid-cols-3 gap-12 max-w-6xl mx-auto">
            <div className="text-center space-y-4">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center mx-auto backdrop-blur-sm border border-border/50 shadow-lg">
                <Upload className="w-10 h-10 text-primary" strokeWidth={1.5} />
              </div>
              <div className="space-y-2">
                <div className="font-display text-sm text-accent font-semibold">STEP 01</div>
                <h3 className="text-2xl font-display font-semibold">Upload Your Data</h3>
                <p className="text-muted-foreground leading-relaxed">Import from CSV, Excel, Google Sheets, or paste directly</p>
              </div>
            </div>

            <div className="text-center space-y-4">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-accent/20 to-accent/5 flex items-center justify-center mx-auto backdrop-blur-sm border border-border/50 shadow-lg">
                <Wand2 className="w-10 h-10 text-accent" strokeWidth={1.5} />
              </div>
              <div className="space-y-2">
                <div className="font-display text-sm text-accent font-semibold">STEP 02</div>
                <h3 className="text-2xl font-display font-semibold">Design Your Template</h3>
                <p className="text-muted-foreground leading-relaxed">Choose a template or upload your own design</p>
              </div>
            </div>

            <div className="text-center space-y-4">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-success/20 to-success/5 flex items-center justify-center mx-auto backdrop-blur-sm border border-border/50 shadow-lg">
                <Download className="w-10 h-10 text-success" strokeWidth={1.5} />
              </div>
              <div className="space-y-2">
                <div className="font-display text-sm text-accent font-semibold">STEP 03</div>
                <h3 className="text-2xl font-display font-semibold">Generate & Download</h3>
                <p className="text-muted-foreground leading-relaxed">Get your personalized PDFs in seconds</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="container mx-auto px-4 py-24">
        <div className="text-center mb-16">
          <Badge variant="outline" className="mb-4 text-xs uppercase tracking-wider">Features</Badge>
          <h2 className="font-display text-4xl md:text-5xl font-bold mb-4">Powerful Features</h2>
          <p className="text-xl text-muted-foreground">Everything you need to create professional documents</p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto">
          {features.map((feature, index) => (
            <Card key={index} className="group">
              <CardHeader>
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary/10 to-accent/5 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                  <feature.icon className="w-7 h-7 text-primary" strokeWidth={1.5} />
                </div>
                <CardTitle className="text-xl font-display">{feature.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground leading-relaxed">{feature.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Use Cases */}
      <section id="use-cases" className="py-24 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-background to-muted/30"></div>
        <div className="container mx-auto px-4 relative z-10">
          <div className="text-center mb-16">
            <Badge variant="outline" className="mb-4 text-xs uppercase tracking-wider">Use Cases</Badge>
            <h2 className="font-display text-4xl md:text-5xl font-bold mb-4">Perfect For</h2>
            <p className="text-xl text-muted-foreground">See what you can create</p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 max-w-5xl mx-auto">
            {useCases.map((useCase, index) => (
              <Card key={index} className="group">
                <CardHeader>
                  <CardTitle className="text-xl font-display group-hover:text-accent transition-colors duration-300">{useCase.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground leading-relaxed">{useCase.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-4 py-24">
        <div className="max-w-5xl mx-auto relative">
          <div className="absolute inset-0 bg-gradient-to-br from-accent/10 via-primary/5 to-success/10 rounded-3xl blur-3xl"></div>
          <Card className="relative border-accent/20 shadow-2xl overflow-hidden">
            <div className="absolute inset-0 opacity-5" style={{ background: 'var(--gradient-mesh)' }}></div>
            <CardContent className="p-12 md:p-16 text-center relative z-10">
              <div className="space-y-6">
                <Badge variant="outline" className="text-xs uppercase tracking-wider">Get Started</Badge>
                <h2 className="font-display text-4xl md:text-5xl lg:text-6xl font-bold">
                  Ready to Transform
                  <span className="block text-accent mt-2">Your Data?</span>
                </h2>
                <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
                  Join thousands of users creating beautiful, professional documents in seconds
                </p>
                <div className="pt-4">
                  <Button 
                    size="lg" 
                    variant="premium" 
                    className="text-base px-10 py-6 h-auto"
                  >
                    Start Free Trial
                    <ArrowRight className="ml-2 w-5 h-5" />
                  </Button>
                  <p className="text-sm text-muted-foreground mt-4">No credit card required • Setup in 60 seconds</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t bg-muted/20 relative overflow-hidden">
        <div className="grain-texture"></div>
        <div className="container mx-auto px-4 py-16 relative z-10">
          <div className="grid md:grid-cols-4 gap-12 mb-12">
            <div className="space-y-4">
              <h3 className="font-display text-2xl font-bold text-foreground">
                Mail Merge
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Transform your data into professional documents with AI-powered mail merge.
              </p>
            </div>
            <div>
              <h4 className="font-display font-semibold mb-4 text-sm uppercase tracking-wider">Product</h4>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li><a href="#features" className="hover:text-foreground transition-colors duration-300">Features</a></li>
                <li><a href="#pricing" className="hover:text-foreground transition-colors duration-300">Pricing</a></li>
                <li><a href="#use-cases" className="hover:text-foreground transition-colors duration-300">Use Cases</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-display font-semibold mb-4 text-sm uppercase tracking-wider">Company</h4>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-foreground transition-colors duration-300">About</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors duration-300">Blog</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors duration-300">Contact</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-display font-semibold mb-4 text-sm uppercase tracking-wider">Legal</h4>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-foreground transition-colors duration-300">Privacy</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors duration-300">Terms</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors duration-300">Security</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-border pt-8">
            <p className="text-center text-sm text-muted-foreground">
              © 2024 Mail Merge. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
