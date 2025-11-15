import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, FileText, FileSpreadsheet, FileImage, Award, CreditCard, Tag, Users, ArrowRight, Sparkles, Zap, Shield, Download } from "lucide-react";
import { Link } from "react-router-dom";
import { useState, useEffect } from "react";

const Index = () => {
  const [activeInputIndex, setActiveInputIndex] = useState(0);
  const [activeOutputIndex, setActiveOutputIndex] = useState(0);

  const inputTypes = [
    { icon: FileText, label: "PDF", color: "text-red-500" },
    { icon: FileSpreadsheet, label: "Excel/CSV", color: "text-green-500" },
    { icon: FileImage, label: "Google Sheets", color: "text-blue-500" },
  ];

  const outputTypes = [
    { icon: Award, label: "Certificates", color: "text-purple-500" },
    { icon: Tag, label: "Labels", color: "text-orange-500" },
    { icon: CreditCard, label: "Cards", color: "text-pink-500" },
    { icon: Users, label: "Name Badges", color: "text-indigo-500" },
  ];

  useEffect(() => {
    const inputInterval = setInterval(() => {
      setActiveInputIndex((prev) => (prev + 1) % inputTypes.length);
    }, 2000);

    const outputInterval = setInterval(() => {
      setActiveOutputIndex((prev) => (prev + 1) % outputTypes.length);
    }, 2000);

    return () => {
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
      icon: Sparkles,
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
      description: "Create personalized certificates for course completions, awards, and achievements.",
      gradient: "from-purple-500 to-pink-500",
    },
    {
      title: "Product Labels",
      description: "Generate variable SKU labels, barcodes, and product information for inventory.",
      gradient: "from-blue-500 to-cyan-500",
    },
    {
      title: "Name Badges",
      description: "Design professional badges for conferences, meetings, and corporate events.",
      gradient: "from-orange-500 to-red-500",
    },
    {
      title: "Gift Cards",
      description: "Produce unique gift cards, vouchers, and promotional materials at scale.",
      gradient: "from-green-500 to-emerald-500",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                <FileText className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold text-foreground">MergeFlow</span>
            </div>
            <div className="hidden md:flex items-center gap-6">
              <a href="#features" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                Features
              </a>
              <a href="#pricing" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                Pricing
              </a>
              <a href="#use-cases" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                Use Cases
              </a>
            </div>
            <div className="flex items-center gap-3">
              <Link to="/auth">
                <Button variant="ghost">Login</Button>
              </Link>
              <Link to="/auth">
                <Button>Sign Up</Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section with Animated Split */}
      <section className="relative overflow-hidden bg-gradient-to-b from-background to-muted/20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-32">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left: Animated Inputs */}
            <div className="space-y-8">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 text-accent text-sm font-medium">
                <Sparkles className="w-4 h-4" />
                <span>AI-Powered Mail Merge</span>
              </div>
              
              <div className="space-y-4">
                <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-foreground leading-tight">
                  Transform Your Data Into{" "}
                  <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                    Professional PDFs
                  </span>
                </h1>
                <p className="text-xl text-muted-foreground max-w-xl">
                  Create personalized certificates, labels, cards, and more from your spreadsheets. No design skills required.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-4">
                <Link to="/auth">
                  <Button size="lg" className="w-full sm:w-auto">
                    Get Started Free
                    <ArrowRight className="ml-2 w-4 h-4" />
                  </Button>
                </Link>
                <Button size="lg" variant="outline" className="w-full sm:w-auto">
                  Watch Demo
                </Button>
              </div>

              {/* Animated Input Types */}
              <div className="flex items-center gap-6 pt-8">
                <span className="text-sm font-medium text-muted-foreground">Works with:</span>
                <div className="flex gap-4">
                  {inputTypes.map((input, idx) => (
                    <div
                      key={input.label}
                      className={`transition-all duration-500 ${
                        idx === activeInputIndex
                          ? "opacity-100 scale-110"
                          : "opacity-40 scale-90"
                      }`}
                    >
                      <div className={`w-12 h-12 rounded-lg bg-card border border-border flex items-center justify-center ${input.color}`}>
                        <input.icon className="w-6 h-6" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right: Animated Outputs with Diagonal Slash */}
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-accent/20 to-success/20 blur-3xl rounded-full" />
              <div className="relative grid grid-cols-2 gap-4">
                {outputTypes.map((output, idx) => (
                  <Card
                    key={output.label}
                    className={`transition-all duration-500 hover:scale-105 ${
                      idx === activeOutputIndex
                        ? "ring-2 ring-primary shadow-xl"
                        : "opacity-60"
                    }`}
                  >
                    <CardContent className="p-6 space-y-2">
                      <div className={`w-12 h-12 rounded-lg bg-gradient-to-br from-card to-muted flex items-center justify-center ${output.color}`}>
                        <output.icon className="w-6 h-6" />
                      </div>
                      <p className="font-semibold text-foreground">{output.label}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Diagonal Slash Divider */}
        <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-r from-primary via-accent to-primary transform -skew-y-2 origin-top-left opacity-10" />
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 lg:py-32 bg-muted/20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground">
              Simple, Transparent Pricing
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Choose the perfect plan for your needs. All plans include a 14-day free trial.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto">
            {pricingTiers.map((tier) => (
              <Card
                key={tier.name}
                className={`relative transition-all duration-300 hover:scale-105 hover:shadow-xl ${
                  tier.popular ? "ring-2 ring-success shadow-lg" : ""
                }`}
              >
                {tier.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <Badge className="bg-success text-success-foreground">Most Popular</Badge>
                  </div>
                )}
                <CardHeader>
                  <CardTitle className="text-2xl">{tier.name}</CardTitle>
                  <CardDescription>
                    <span className="text-4xl font-bold text-foreground">{tier.price}</span>
                    <span className="text-muted-foreground">{tier.period}</span>
                  </CardDescription>
                  <div className="pt-2">
                    <p className="text-sm font-medium text-muted-foreground">
                      {tier.pages} pages/month
                    </p>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="space-y-2">
                    {tier.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2">
                        <Check className="w-5 h-5 text-success shrink-0 mt-0.5" />
                        <span className="text-sm text-muted-foreground">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter>
                  <Button
                    className="w-full"
                    variant={tier.popular ? "default" : "outline"}
                  >
                    {tier.cta}
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 lg:py-32">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground">
              How It Works
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              From data to professional documents in three simple steps
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {[
              { step: "1", title: "Upload Your Data", description: "Import from CSV, Excel, or Google Sheets" },
              { step: "2", title: "Design Your Template", description: "Use our drag-and-drop editor or choose a template" },
              { step: "3", title: "Generate & Download", description: "Get print-ready PDFs in seconds" },
            ].map((item) => (
              <div key={item.step} className="text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary to-accent text-white font-bold text-2xl flex items-center justify-center mx-auto">
                  {item.step}
                </div>
                <h3 className="text-xl font-semibold text-foreground">{item.title}</h3>
                <p className="text-muted-foreground">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 lg:py-32 bg-muted/20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground">
              Powerful Features
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Everything you need to create professional variable data documents
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((feature) => (
              <Card key={feature.title} className="border-none shadow-md hover:shadow-xl transition-shadow">
                <CardHeader>
                  <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center mb-4">
                    <feature.icon className="w-6 h-6 text-white" />
                  </div>
                  <CardTitle className="text-xl">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Use Cases */}
      <section id="use-cases" className="py-20 lg:py-32">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground">
              Perfect For Every Use Case
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              From small businesses to enterprises, MergeFlow handles it all
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {useCases.map((useCase) => (
              <Card
                key={useCase.title}
                className="group hover:scale-105 transition-all duration-300 overflow-hidden"
              >
                <div className={`h-40 bg-gradient-to-br ${useCase.gradient} opacity-80 group-hover:opacity-100 transition-opacity`} />
                <CardHeader>
                  <CardTitle className="text-xl">{useCase.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">{useCase.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 lg:py-32 bg-gradient-to-br from-primary via-accent to-primary">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="max-w-3xl mx-auto space-y-6">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white">
              Ready to Transform Your Workflow?
            </h2>
            <p className="text-xl text-white/90">
              Join thousands of businesses creating professional documents at scale
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
              <Link to="/auth">
                <Button size="lg" variant="secondary" className="w-full sm:w-auto">
                  Start Free Trial
                  <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </Link>
              <Button size="lg" variant="outline" className="w-full sm:w-auto bg-white/10 text-white border-white/20 hover:bg-white/20">
                Schedule Demo
              </Button>
            </div>
          </div>
        </div>
      </section>

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
