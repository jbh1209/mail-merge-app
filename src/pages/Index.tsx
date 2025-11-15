import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, Zap, Shield, Download, Upload, Wand2, ArrowRight, PlayCircle, Sparkles } from "lucide-react";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

const Index = () => {
  const navigate = useNavigate();
  const [painPointIndex, setPainPointIndex] = useState(0);

  const painPoints = [
    "Fighting with Word mail merge again.",
    "Trying to line up Avery labels by hand.",
    "Rebuilding the same certificate in Canva for the 50th name.",
    "Copy-pasting address labels one by one.",
    "Wondering why your PDF has the wrong bleed — again."
  ];

  useEffect(() => {
    const painInterval = setInterval(() => {
      setPainPointIndex((prev) => (prev + 1) % painPoints.length);
    }, 3000);

    return () => {
      clearInterval(painInterval);
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
      <section className="relative px-6 md:px-12 py-20 md:py-32 overflow-hidden bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50">
        {/* Radial gradient overlays */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(129,140,248,0.35),transparent_60%),radial-gradient(circle_at_bottom_left,_rgba(56,189,248,0.4),transparent_60%)]"></div>
        
        <div className="relative max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Left Column - Content */}
            <div className="space-y-8">
              <div>
                <h1 className="text-5xl md:text-6xl lg:text-7xl font-extrabold leading-[1.1] mb-6">
                  <span className="text-foreground">Create Beautiful</span>
                  <br />
                  <span className="text-foreground">Variable Data</span>
                  <br />
                  <span className="text-foreground">Documents</span>
                  <br />
                  <span className="text-foreground">in Seconds</span>
                </h1>
                
                <p className="text-lg md:text-xl text-muted-foreground max-w-xl leading-relaxed">
                  Turn any spreadsheet into labels, certificates, badges, shelf strips, event passes and more. Upload your data and template — we handle the merge, layout and print-ready PDF.
                </p>
              </div>

              {/* Rotating Pain Points */}
              <div className="space-y-2">
                <p className="text-base md:text-lg text-muted-foreground">
                  <span className="font-semibold text-foreground">Never again:</span>
                </p>
                <div className="relative h-8 flex items-center" aria-live="polite">
                  {painPoints.map((point, index) => (
                    <p
                      key={index}
                      className={`absolute text-base md:text-lg text-muted-foreground transition-opacity duration-300 ${
                        index === painPointIndex ? 'opacity-100' : 'opacity-0'
                      }`}
                    >
                      {point}
                    </p>
                  ))}
                </div>
              </div>

              {/* Blue Tagline */}
              <p className="text-xl md:text-2xl font-semibold text-primary">
                From spreadsheet to finished documents — instantly
              </p>

              {/* CTA Buttons */}
              <div className="flex flex-col sm:flex-row gap-4">
                <Button 
                  size="lg" 
                  className="text-base px-8 py-6 bg-primary hover:bg-primary/90 text-primary-foreground"
                  onClick={() => navigate('/auth')}
                >
                  Start Free — No Credit Card
                </Button>
                <Button 
                  size="lg" 
                  variant="outline" 
                  className="text-base px-8 py-6 border-2 border-foreground/20 hover:bg-foreground/5"
                >
                  <PlayCircle className="w-5 h-5 mr-2" />
                  See How It Works
                </Button>
              </div>
            </div>

            {/* Right Column - Visual */}
            <div className="relative flex items-center justify-center lg:justify-end">
              <div className="relative w-full max-w-md lg:max-w-lg">
                {/* Spreadsheet Card (Left) */}
                <div className="absolute left-0 top-0 lg:left-[-20px] z-10 bg-card rounded-2xl shadow-xl border border-border p-6 transform hover:scale-105 transition-transform">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2 px-3 text-foreground font-semibold">Name</th>
                        <th className="text-left py-2 px-3 text-foreground font-semibold">ID</th>
                      </tr>
                    </thead>
                    <tbody className="text-muted-foreground">
                      <tr className="border-b border-border/50">
                        <td className="py-2 px-3">Alice Smith</td>
                        <td className="py-2 px-3">001</td>
                      </tr>
                      <tr className="border-b border-border/50">
                        <td className="py-2 px-3">John Doe</td>
                        <td className="py-2 px-3">002</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3">Emily Johnson</td>
                        <td className="py-2 px-3">003</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Magic Circle (Center) */}
                <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 z-20">
                  <div className="relative">
                    <div className="w-24 h-24 md:w-28 md:h-28 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-2xl">
                      <Sparkles className="w-10 h-10 text-primary-foreground" />
                    </div>
                    {/* Arrow */}
                    <ArrowRight className="absolute -right-8 top-1/2 -translate-y-1/2 w-6 h-6 text-primary" />
                  </div>
                </div>

                {/* Badge Card (Right) */}
                <div className="absolute right-0 bottom-0 lg:right-[-20px] z-30 bg-card rounded-2xl shadow-2xl border border-border p-8 w-72 transform hover:scale-105 transition-transform">
                  <div className="space-y-4">
                    <div className="h-2 w-full bg-primary/20 rounded-full"></div>
                    <div className="text-center space-y-3">
                      <h3 className="text-2xl font-bold text-foreground">Alice Smith</h3>
                      <p className="text-lg text-muted-foreground font-mono">001</p>
                    </div>
                    <div className="flex justify-end mt-6">
                      <div className="w-16 h-16 bg-foreground/5 rounded-lg flex items-center justify-center">
                        <div className="text-xs text-muted-foreground">QR</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
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
